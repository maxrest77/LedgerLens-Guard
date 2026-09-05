from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timedelta

from backend.api.main import app
from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus,
    AuditState
)
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics_phase5.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # 1. Reviewers with distinct roles & portfolios: ADMIN and REVIEWER
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewerA@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))
        session.add(Reviewer(email="reviewerB@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_B"))

        now = utc_now()

        # 2. Seed cases with deliberate pattern signatures:
        # Case 1: PORTFOLIO_A - Near-miss: GST rounding drift (delta 250 paisa, confidence 0.85)
        session.add(ReconciliationCase(
            case_id="case_p5_1",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="LOW",
            status=CaseStatus.OPEN,
            expected_paisa=10000,
            actual_paisa=9750,
            delta_paisa=250,
            confidence_score=0.85,
            explanation="GST fractional rounding drift of 250 paisa",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=3)  # Trending late (>2 days)
        ))

        # Case 2: PORTFOLIO_A - Near-miss: MDR Fee variance (delta 1200 paisa, confidence 0.88, velocity + refund anomaly text)
        session.add(ReconciliationCase(
            case_id="case_p5_2",
            portfolio_id="PORTFOLIO_A",
            exception_code="SYSTEMATIC_FEE_DEVIATION",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            expected_paisa=50000,
            actual_paisa=48800,
            delta_paisa=1200,
            confidence_score=0.88,
            explanation="MDR contracted fee rate variance detected with velocity spike and refund surge",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=1)  # Normal TAT (<2 days)
        ))

        # Case 3: PORTFOLIO_A - Exact match (confidence 1.0, delta 0)
        session.add(ReconciliationCase(
            case_id="case_p5_3",
            portfolio_id="PORTFOLIO_A",
            exception_code="NONE",
            severity="INFO",
            status=CaseStatus.APPROVED,
            expected_paisa=20000,
            actual_paisa=20000,
            delta_paisa=0,
            confidence_score=1.00,
            explanation="Exact match",
            suggested_action="NONE",
            opened_at=now - timedelta(days=5)
        ))

        # Case 4: PORTFOLIO_B - Settlement late (missing settlement, opened 4 days ago, delta 80000 paisa)
        session.add(ReconciliationCase(
            case_id="case_p5_4",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=80000,
            actual_paisa=0,
            delta_paisa=80000,
            confidence_score=0.70,
            explanation="Missing settlement cutoff with velocity anomaly and IP cluster",
            suggested_action="MANUAL_SETTLE",
            opened_at=now - timedelta(days=4)  # Trending late (>2 days)
        ))

        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
        session.commit()

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def _get_token(client, username, password="pass"):
    client.cookies.clear()
    res = client.post("/auth/login", data={"username": username, "password": password})
    assert res.status_code == 200
    token = res.json()["access_token"]
    client.cookies.clear()
    return token

# ── Test Task 5.1: Counterfactual Near-Miss Insights ─────────────────────────
def test_near_miss_insights_aggregate_and_scoping(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Reviewer A (Scoped to PORTFOLIO_A):
    # Total cases in A = 3 (case_p5_1, case_p5_2, case_p5_3).
    # Near-miss cases in A = 2 (case_p5_1 conf 0.85, case_p5_2 conf 0.88).
    # Does NOT see case_p5_4 from PORTFOLIO_B.
    client.cookies.clear()
    res = client.get("/api/analytics/predictive/near-misses", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["widget_type"] == "PREDICTIVE_COUNTERFACTUAL_PATTERN"
    assert data["is_deterministic"] is False
    assert "PROBABILISTIC" in data["disclaimer"]
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert data["total_cases_analyzed"] == 3
    assert data["total_near_misses"] == 2
    assert data["near_miss_rate_pct"] == round(2 / 3 * 100.0, 1)

    patterns = data["patterns"]
    pattern_names = [p["explanation_pattern"] for p in patterns]
    assert "GST & Fractional Rounding Drift" in pattern_names
    assert "MDR & Contracted Fee Deviations" in pattern_names

    # Pattern-level only: verify NO case IDs or individual case entities are exposed
    for p in patterns:
        assert "case_id" not in p
        assert "case_ids" not in p
        assert "share_pct" in p
        assert "avg_confidence_score" in p

    # 2. Admin (Company-Wide):
    # Sees all cases across A and B: total 4 cases, 3 near-misses (case_p5_1, case_p5_2, case_p5_4)
    client.cookies.clear()
    res = client.get("/api/analytics/predictive/near-misses", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["portfolio_scope"] == "COMPANY_WIDE"
    assert admin_data["total_cases_analyzed"] == 4
    assert admin_data["total_near_misses"] == 3

# ── Test Task 5.2: Settlement Nowcasting Panel ────────────────────────────────
def test_settlement_nowcast_estimates_and_scoping(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Reviewer A (PORTFOLIO_A):
    # In PORTFOLIO_A: case_p5_1 is OPEN and 3 days old (>2d) -> trending late.
    # case_p5_2 is OPEN but 1 day old (<2d).
    # case_p5_3 is APPROVED.
    # So trending_late_count == 1 in PORTFOLIO_A!
    client.cookies.clear()
    res = client.get("/api/analytics/predictive/settlement-nowcast", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["widget_type"] == "PROBABILISTIC_NOWCAST_ESTIMATE"
    assert data["is_deterministic"] is False
    assert "PROBABILISTIC ESTIMATE ONLY" in data["disclaimer"]
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert data["trending_late_count"] == 1
    assert data["at_risk_paisa"] == 250
    assert data["at_risk_inr"] == 2.50
    assert data["probability_pct"] > 0

    # 2. Admin (Company-Wide):
    # In PORTFOLIO_A + PORTFOLIO_B:
    # case_p5_1 (3 days old) + case_p5_4 (MISSING_SETTLEMENT, 4 days old, 80000 paisa)
    # Total trending late == 2, total at risk == 80250 paisa (Rs 802.50)
    client.cookies.clear()
    res = client.get("/api/analytics/predictive/settlement-nowcast", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["portfolio_scope"] == "COMPANY_WIDE"
    assert admin_data["trending_late_count"] == 2
    assert admin_data["at_risk_paisa"] == 80250
    assert admin_data["at_risk_inr"] == 802.50

# ── Test Task 5.3: Risk Signal Correlation View ──────────────────────────────
def test_risk_signal_correlation_telemetry(client):
    admin_tok = _get_token(client, "admin@test.com")

    client.cookies.clear()
    res = client.get("/api/analytics/predictive/risk-correlations", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["widget_type"] == "MULTI_SIGNAL_RISK_CORRELATION"
    assert data["is_deterministic"] is False
    assert "STATISTICAL RISK CORRELATION" in data["disclaimer"]
    assert "Rule I1" in data["rule_i1_standard"]

    # Verify signals and co-occurrences exist
    breakdown = data["signal_breakdown"]
    assert "velocity_spike" in breakdown
    assert "refund_anomaly" in breakdown
    assert "ip_clustering" in breakdown

    co_occurrences = data["co_occurrences"]
    pairs = [c["pair"] for c in co_occurrences]
    assert "Velocity Spike + Refund Anomaly" in pairs
    assert "Velocity Spike + IP Clustering" in pairs
    assert "Refund Anomaly + IP Clustering" in pairs

# ── Test Combined Predictive Bundle Endpoint ─────────────────────────────────
def test_predictive_summary_bundle(client):
    admin_tok = _get_token(client, "admin@test.com")

    client.cookies.clear()
    res = client.get("/api/analytics/predictive/summary", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    bundle = res.json()
    assert "near_misses" in bundle
    assert "settlement_nowcast" in bundle
    assert "risk_correlations" in bundle
    assert bundle["near_misses"]["is_deterministic"] is False
    assert bundle["settlement_nowcast"]["is_deterministic"] is False
    assert bundle["risk_correlations"]["is_deterministic"] is False
