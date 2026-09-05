import os
import pytest
from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from backend.api.main import app
from backend.api.auth import get_db, create_access_token, get_password_hash
from backend.data.schema import (
    Reviewer, Role, Payment, Settlement, SettlementPaymentLink,
    BankEntry, ReconciliationCase, CaseStatus, PaymentMethod, PaymentStatus
)
from backend.engine.routing_advisor import evaluate_routing_advice, calculate_two_proportion_z_score

# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Seed admin reviewer
        session.add(Reviewer(
            email="admin@ledgerlens.dev",
            hashed_password=get_password_hash("demo_admin_2024"),
            role=Role.ADMIN,
            portfolio_id="GLOBAL"
        ))
        session.commit()
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_db] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def create_auth_token(email: str, role: Role = Role.ADMIN) -> str:
    return create_access_token(
        data={"sub": email, "role": role.value, "user_id": 1},
        expires_delta=timedelta(minutes=30)
    )

# ── Task 11.1: MDR Deviation Panel Test ──────────────────────────────────────

def test_mdr_deviation_exact_computation(client: TestClient, session: Session):
    """
    Seeded data with a known expected-vs-actual rate difference;
    asserts displayed deviation matches the computed value exactly.
    """
    token = create_auth_token("admin@ledgerlens.dev", Role.ADMIN)
    headers = {"Authorization": f"Bearer {token}", "X-CSRF-Protection": "1"}

    # Seed 10 payments for VELOCEPAY
    # Gross: 10 * 10,000 paisa = 100,000 paisa (₹1,000)
    # Credit card fee rate: 2.00% (200 bps) -> Expected fee = 2,000 paisa
    now = utc_now()
    setl_id = "setl_test_mdr_01"
    payments = []
    links = []
    for i in range(10):
        pid = f"pay_mdr_{i:02d}"
        p = Payment(
            payment_id=pid,
            order_id=f"ord_{i}",
            merchant_id="merch_01",
            amount_paisa=10_000,
            payment_method=PaymentMethod.CREDIT_CARD,
            status=PaymentStatus.CAPTURED,
            captured_at=now,
            originating_ip="127.0.0.1",
            customer_id="cust_01",
            bank_code="AURA",
            psp_provider="VELOCEPAY",
        )
        payments.append(p)
        links.append(SettlementPaymentLink(settlement_id=setl_id, payment_id=pid))

    # Actual fee in settlement: 2,500 paisa (2.50%) -> deliberate +0.50% inflation
    settlement = Settlement(
        settlement_id=setl_id,
        utr="AURA2026MDR0001",
        gross_paisa=100_000,
        fee_paisa=2_500,
        tax_paisa=450,
        net_paisa=97_050,
        settled_at=now,
        on_hold=False,
        psp_provider="VELOCEPAY",
    )

    # Seed a FEE_RATE_MISMATCH case
    case = ReconciliationCase(
        case_id="case_mdr_test_01",
        exception_code="FEE_RATE_MISMATCH",
        severity="MEDIUM",
        settlement_id=setl_id,
        expected_paisa=2_000,
        actual_paisa=2_500,
        delta_paisa=-500,
        confidence_score=0.98,
        explanation="Fee mismatch",
        suggested_action="Verify fee table",
        status=CaseStatus.OPEN,
        opened_at=now
    )

    session.add_all(payments)
    session.add(settlement)
    session.add_all(links)
    session.add(case)
    session.commit()

    resp = client.get("/api/admin/psp-health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    velo = next((p for p in data if p["psp_provider"] == "VELOCEPAY"), None)
    assert velo is not None
    mdr = velo["mdr"]

    # Expected: 2.0%, Actual: 2.5%, Deviation: +0.5%
    assert mdr["expected_rate_pct"] == 2.0
    assert mdr["actual_rate_pct"] == 2.5
    assert mdr["deviation_pct"] == 0.5
    assert mdr["fee_mismatch_count"] == 1

# ── Task 11.2: Multi-Gateway Proof & Strict Isolation Test ───────────────────

def test_multi_gateway_isolation_and_demo_labels(client: TestClient, session: Session):
    """
    Confirms the reconciliation engine correctly separates cases by gateway
    with zero cross-contamination. Non-VelocePay gateways must be marked is_synthetic=True.
    """
    token = create_auth_token("admin@ledgerlens.dev", Role.ADMIN)
    headers = {"Authorization": f"Bearer {token}", "X-CSRF-Protection": "1"}

    now = utc_now()

    # Seed VelocePay settlement and case
    velo_setl = Settlement(
        settlement_id="setl_velo_01",
        utr="AURAVELO0001",
        gross_paisa=500_000,
        fee_paisa=10_000,
        tax_paisa=1_800,
        net_paisa=488_200,
        settled_at=now,
        psp_provider="VELOCEPAY",
    )
    velo_case = ReconciliationCase(
        case_id="case_velo_only",
        exception_code="BANK_CREDIT_SHORTFALL",
        severity="HIGH",
        settlement_id="setl_velo_01",
        expected_paisa=488_200,
        actual_paisa=450_000,
        delta_paisa=38_200,
        confidence_score=0.95,
        explanation="Shortfall",
        suggested_action="Investigate",
        status=CaseStatus.OPEN,
        opened_at=now
    )

    # Seed PrismPay settlement and case
    pris_setl = Settlement(
        settlement_id="setl_pris_01",
        utr="PRIS26080001",
        gross_paisa=300_000,
        fee_paisa=6_000,
        tax_paisa=1_080,
        net_paisa=292_920,
        settled_at=now,
        psp_provider="PRISMPAY",
    )
    pris_case = ReconciliationCase(
        case_id="case_pris_only",
        exception_code="MISSING_BANK_CREDIT",
        severity="CRITICAL",
        settlement_id="setl_pris_01",
        expected_paisa=292_920,
        actual_paisa=0,
        delta_paisa=292_920,
        confidence_score=0.99,
        explanation="Missing credit",
        suggested_action="Escalate",
        status=CaseStatus.OPEN,
        opened_at=now
    )

    session.add_all([velo_setl, velo_case, pris_setl, pris_case])
    session.commit()

    resp = client.get("/api/admin/psp-health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    velo_entry = next((p for p in data if p["psp_provider"] == "VELOCEPAY"), None)
    pris_entry = next((p for p in data if p["psp_provider"] == "PRISMPAY"), None)

    assert velo_entry is not None
    assert pris_entry is not None

    # Honesty constraint: VelocePay is real, PrismPay is synthetic
    assert velo_entry["is_synthetic"] is False
    assert pris_entry["is_synthetic"] is True

    # Zero cross-contamination: each gateway must strictly attribute its own exception
    assert velo_entry["exception_count"] == 1
    assert pris_entry["exception_count"] == 1

# ── Task 11.3: Gateway Trust Score Composite Test ─────────────────────────────

def test_gateway_trust_score_calculation(client: TestClient, session: Session):
    """
    Tests that composite trust score matches the weighted formula:
    35% Match Rate + 20% Latency + 25% Fee Accuracy + 20% Anomaly Freedom.
    """
    token = create_auth_token("admin@ledgerlens.dev", Role.ADMIN)
    headers = {"Authorization": f"Bearer {token}", "X-CSRF-Protection": "1"}

    resp = client.get("/api/admin/psp-health", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    data = body["data"]

    for psp in data:
        ts = psp["trust_score"]
        assert "composite" in ts
        assert "match_rate_score" in ts
        assert "settlement_latency_score" in ts
        assert "fee_accuracy_score" in ts
        assert "anomaly_freedom_score" in ts

        # Verify composite weighting: 0.35*M + 0.20*L + 0.25*F + 0.20*A
        expected_composite = round(
            (ts["match_rate_score"] * 0.35) +
            (ts["settlement_latency_score"] * 0.20) +
            (ts["fee_accuracy_score"] * 0.25) +
            (ts["anomaly_freedom_score"] * 0.20),
            1
        )
        assert abs(ts["composite"] - expected_composite) <= 0.1

    # Verify radar_metrics structure
    radar = body["radar_metrics"]
    assert len(radar) == 4
    metrics = [r["metric"] for r in radar]
    assert "Match Rate" in metrics
    assert "Settlement Latency" in metrics
    assert "Fee Accuracy" in metrics
    assert "Anomaly Freedom" in metrics

# ── Task 11.4: Match-Rate Trend Sparkline Test ────────────────────────────────

def test_match_rate_trend_sparkline_length_and_trend(client: TestClient, session: Session):
    """
    Verifies that match_rate_sparkline contains N=7 trend points and ends with current match_rate.
    """
    token = create_auth_token("admin@ledgerlens.dev", Role.ADMIN)
    headers = {"Authorization": f"Bearer {token}", "X-CSRF-Protection": "1"}

    resp = client.get("/api/admin/psp-health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    for psp in data:
        sparkline = psp["match_rate_sparkline"]
        assert isinstance(sparkline, list)
        assert len(sparkline) == 7
        # Last element should match the current match rate
        assert sparkline[-1] == psp["match_rate"]

# ── Task 11.5: Smart Routing Advisor Positive & Negative Cases ────────────────

def test_smart_routing_advisor_positive_case():
    """
    Positive case: Given two seeded synthetic PSPs with a known, deliberately-constructed
    cost and reliability gap, assert the advisor correctly identifies the better-performing
    gateway and states the right magnitude with real computed numbers.
    """
    psp_summaries = [
        {
            "psp_provider": "GATEWAY_A",
            "settlements_count": 30,
            "payments_count": 70,  # 100 total
            "match_rate": 98.0,
            "exception_count": 2,  # 2% exception rate
            "mdr": {"actual_rate_pct": 1.45}  # 1.45% fee
        },
        {
            "psp_provider": "GATEWAY_B",
            "settlements_count": 30,
            "payments_count": 70,  # 100 total
            "match_rate": 88.0,
            "exception_count": 12,  # 12% exception rate
            "mdr": {"actual_rate_pct": 1.95}  # 1.95% fee (0.50% higher)
        }
    ]

    advice = evaluate_routing_advice(psp_summaries, min_sample_size=20)
    assert advice["has_recommendation"] is True
    assert advice["is_advisory_only"] is True
    assert advice["leader_psp"] == "GATEWAY_A"
    assert advice["benchmark_psp"] == "GATEWAY_B"
    assert advice["cost_advantage_pct"] == 0.5  # 1.95 - 1.45
    assert advice["exception_reduction_pct"] > 80.0  # 83.3% reduction
    assert "GATEWAY_A" in advice["recommendation"]
    assert "0.50% lower effective MDR fee" in advice["recommendation"]
    assert "Advisory Insight" in advice["recommendation"]

def test_smart_routing_advisor_negative_case_insignificant_difference():
    """
    Negative case 1: Seed two PSPs with statistically insignificant differences.
    Assert the advisor stays silent (has_recommendation=False) and outputs no recommendation.
    """
    psp_summaries = [
        {
            "psp_provider": "GATEWAY_ALPHA",
            "settlements_count": 25,
            "payments_count": 25,  # 50 total
            "match_rate": 96.0,
            "exception_count": 2,  # 4.0%
            "mdr": {"actual_rate_pct": 1.82}
        },
        {
            "psp_provider": "GATEWAY_BETA",
            "settlements_count": 25,
            "payments_count": 25,  # 50 total
            "match_rate": 96.0,
            "exception_count": 2,  # 4.0%
            "mdr": {"actual_rate_pct": 1.84}  # 0.02% diff (within noise margin < 0.15%)
        }
    ]

    advice = evaluate_routing_advice(psp_summaries, min_sample_size=20)
    assert advice["has_recommendation"] is False
    assert advice["recommendation"] is None
    assert "normal statistical deviation" in advice["reason"]

def test_smart_routing_advisor_negative_case_insufficient_sample_size():
    """
    Negative case 2: Seed two PSPs with high difference but trivial sample size (e.g. 3 transactions).
    Assert no recommendation is generated.
    """
    psp_summaries = [
        {
            "psp_provider": "TINY_A",
            "settlements_count": 1,
            "payments_count": 2,  # 3 total (< 20 threshold)
            "match_rate": 100.0,
            "exception_count": 0,
            "mdr": {"actual_rate_pct": 1.0}
        },
        {
            "psp_provider": "TINY_B",
            "settlements_count": 1,
            "payments_count": 2,  # 3 total (< 20 threshold)
            "match_rate": 66.0,
            "exception_count": 1,
            "mdr": {"actual_rate_pct": 2.5}
        }
    ]

    advice = evaluate_routing_advice(psp_summaries, min_sample_size=20)
    assert advice["has_recommendation"] is False
    assert advice["recommendation"] is None
    assert "Insufficient sample size" in advice["reason"]
