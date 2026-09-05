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
from backend.audit.chain import append_to_chain
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics_phase6.db"
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

        # DPDP Erased reviewer account
        session.add(Reviewer(email="erased_user@test.com", hashed_password="[ERASED]", role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))

        now = utc_now()

        # 2. Seed cases across PORTFOLIO_A and PORTFOLIO_B:
        # Case A1: Auto-resolved exact match in PORTFOLIO_A
        session.add(ReconciliationCase(
            case_id="case_p6_a1",
            portfolio_id="PORTFOLIO_A",
            exception_code="NONE",
            severity="INFO",
            status=CaseStatus.AUTO_RESOLVED,
            expected_paisa=50000,
            actual_paisa=50000,
            delta_paisa=0,
            confidence_score=1.00,
            explanation="Exact match",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=5),
            resolved_at=now - timedelta(days=5),
            resolved_by="system"
        ))

        # Case A2: Critical exception in PORTFOLIO_A, resolved-approved
        session.add(ReconciliationCase(
            case_id="case_p6_a2",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="CRITICAL",
            status=CaseStatus.APPROVED,
            expected_paisa=100000,
            actual_paisa=95000,
            delta_paisa=5000,
            confidence_score=0.90,
            explanation="MDR fee deviation with velocity spike",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=3),
            resolved_at=now - timedelta(days=2),
            resolved_by="reviewerA@test.com"
        ))

        # Case A3: Medium exception in PORTFOLIO_A, open/pending
        session.add(ReconciliationCase(
            case_id="case_p6_a3",
            portfolio_id="PORTFOLIO_A",
            exception_code="REFUND_WITHOUT_PAYMENT",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            expected_paisa=30000,
            actual_paisa=28000,
            delta_paisa=2000,
            confidence_score=0.85,
            explanation="Refund anomaly without matching payment",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=1)
        ))

        # Case B1: Critical exception in PORTFOLIO_B, open/pending
        session.add(ReconciliationCase(
            case_id="case_p6_b1",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=200000,
            actual_paisa=0,
            delta_paisa=200000,
            confidence_score=0.75,
            explanation="Missing settlement cutoff with IP clustering",
            suggested_action="MANUAL_SETTLE",
            opened_at=now - timedelta(days=2)
        ))

        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
        session.commit()

        # Seed audit block with ADMIN_CROSS_PORTFOLIO_OVERRIDE
        append_to_chain(
            session=session,
            case_id="case_p6_b1",
            reviewer="admin@test.com",
            action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
            reason="Override of PORTFOLIO_B boundary for critical investigation",
            payload_snapshot={"portfolio_id": "PORTFOLIO_B"}
        )
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

# ── Test Task 6.1: Money-Flow Endpoint (Sankey Nodes & Links) ─────────────────
def test_money_flow_sankey_data_and_scoping(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Reviewer A (Scoped to PORTFOLIO_A):
    # Total cases in A = 3 (case_p6_a1, case_p6_a2, case_p6_a3). Total paisa: 50k + 100k + 30k = 180,000 paisa = ₹1,800.00
    client.cookies.clear()
    res = client.get("/api/analytics/money-flow?range=90d", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert data["total_cases_analyzed"] == 3
    assert data["total_inflow_inr"] == 1800.00

    nodes = {n["id"]: n for n in data["nodes"]}
    assert "gateway_settlement" in nodes
    assert "auto_matched" in nodes
    assert "exceptions_critical" in nodes
    assert "resolved_approved" in nodes
    assert "pending_resolution" in nodes

    links = data["links"]
    assert len(links) > 0
    # Auto matched flow: ₹500 (50k paisa)
    auto_link = next(l for l in links if l["source"] == "gateway_settlement" and l["target"] == "auto_matched")
    assert auto_link["value"] == 500.00

    # 2. Admin (Company-Wide):
    # Includes PORTFOLIO_B (200k paisa = ₹2,000.00). Total inflow: ₹3,800.00
    client.cookies.clear()
    res = client.get("/api/analytics/money-flow?range=90d", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["portfolio_scope"] == "COMPANY_WIDE"
    assert admin_data["total_cases_analyzed"] == 4
    assert admin_data["total_inflow_inr"] == 3800.00

# ── Test Task 6.2: Reconciliation Bridge Endpoint (Waterfall Steps) ───────────
def test_reconciliation_bridge_waterfall(client):
    revA_tok = _get_token(client, "reviewerA@test.com")

    client.cookies.clear()
    res = client.get("/api/analytics/bridge?range=90d", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert "steps" in data
    steps = data["steps"]
    labels = [s["label"] for s in steps]
    assert "Expected Net Settlement" in labels
    assert "Gateway & MDR Fees" in labels
    assert "Customer Refunds" in labels
    assert "Discrepancy Mismatches" in labels
    assert "Actual Net Settled" in labels

    # Check that starting step has positive expected settlement
    assert steps[0]["label"] == "Expected Net Settlement"
    assert steps[0]["delta_amount"] > 0
    assert steps[-1]["label"] == "Actual Net Settled"

# ── Test Task 6.3: Portfolio Radar Endpoint (Normalized Scores & Strict Scoping)
def test_portfolio_radar_scoping(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Reviewer A:
    # Must ONLY see PORTFOLIO_A and COMPANY_AVERAGE. PORTFOLIO_B MUST NOT be returned!
    client.cookies.clear()
    res = client.get("/api/analytics/portfolio-radar", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert "company_average" in data
    portfolios = data["portfolios"]
    p_ids = [p["portfolio_id"] for p in portfolios]
    assert "PORTFOLIO_A" in p_ids
    assert "PORTFOLIO_B" not in p_ids  # CRITICAL IDOR / Scope test!

    # Check normalized score dimensions
    pA_scores = portfolios[0]["scores"]
    assert "health_rate" in pA_scores
    assert "resolution_speed" in pA_scores
    assert "case_freshness" in pA_scores
    assert "fee_integrity" in pA_scores
    assert 0 <= pA_scores["health_rate"] <= 100
    assert 0 <= pA_scores["resolution_speed"] <= 100

    # 2. Admin:
    # Sees both PORTFOLIO_A and PORTFOLIO_B in portfolios list
    client.cookies.clear()
    res = client.get("/api/analytics/portfolio-radar", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["portfolio_scope"] == "COMPANY_WIDE"
    admin_p_ids = [p["portfolio_id"] for p in admin_data["portfolios"]]
    assert "PORTFOLIO_A" in admin_p_ids
    assert "PORTFOLIO_B" in admin_p_ids

# ── Test Task 6.4: Daily Activity Endpoint ───────────────────────────────────
def test_daily_activity_timeseries(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # Reviewer A
    client.cookies.clear()
    res = client.get("/api/analytics/daily-activity?days=30", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["days"] == 30
    assert data["portfolio_scope"] == "PORTFOLIO_A"
    assert data["total_opened"] == 3
    assert len(data["daily_activity"]) == 31  # 30 days + today
    
    # Each entry has required fields
    entry = data["daily_activity"][-1]
    assert "date" in entry
    assert "cases_opened" in entry
    assert "cases_resolved" in entry
    assert "health_rate" in entry

    # Admin
    client.cookies.clear()
    res = client.get("/api/analytics/daily-activity?days=30", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["total_opened"] == 4

# ── Test Task 6.5: Risk Correlation Endpoint ─────────────────────────────────
def test_risk_correlation_matrix(client):
    admin_tok = _get_token(client, "admin@test.com")

    client.cookies.clear()
    res = client.get("/api/analytics/risk-correlation", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()
    assert "signal_breakdown" in data
    assert "co_occurrences" in data
    assert "correlation_matrix" in data
    
    matrix = data["correlation_matrix"]
    signals = [m["signal"] for m in matrix]
    assert "velocity_spike" in signals
    assert "refund_anomaly" in signals
    assert "ip_clustering" in signals

# ── Test Task 6.6: Compliance Summary Endpoint ───────────────────────────────
def test_compliance_summary_telemetry(client):
    admin_tok = _get_token(client, "admin@test.com")

    client.cookies.clear()
    res = client.get("/api/analytics/compliance-summary", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()
    
    status = data["current_status"]
    assert status["is_valid"] is True
    assert status["total_blocks"] >= 1
    assert status["total_dpdp_erasures"] == 1  # 1 erased reviewer seeded
    assert status["total_admin_overrides"] == 1  # 1 override block seeded

    assert "verification_history" in data
    assert len(data["verification_history"]) > 0
    assert data["verification_history"][-1]["status"] == "VALID"

    assert "admin_overrides_timeline" in data
    assert len(data["admin_overrides_timeline"]) > 0
