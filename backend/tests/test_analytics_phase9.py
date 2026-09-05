from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from datetime import datetime, timedelta

from backend.api.main import app
from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus, AuditState
)
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics_phase9.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # Seed Reviewers
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewer9@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORT_RISK_A"))
        session.add(Reviewer(email="other_rev@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORT_RISK_B"))

        now = utc_now()

        # Seed known, deliberately constructed risk co-occurrence fixtures in PORT_RISK_A:
        # Fixture 1: Compound Vector: Velocity Spike + Refund Anomaly (CRITICAL)
        session.add(ReconciliationCase(
            case_id="case_p9_compound_1",
            portfolio_id="PORT_RISK_A",
            exception_code="FEE_DEVIATION",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=500000,
            actual_paisa=450000,
            delta_paisa=50000,
            confidence_score=0.95,
            explanation="Velocity spike detected concurrent with refund anomaly across card batches",
            suggested_action="ESCALATE",
            opened_at=now - timedelta(days=2)
        ))

        # Fixture 2: Compound Vector: Velocity Spike + IP Clustering (HIGH)
        session.add(ReconciliationCase(
            case_id="case_p9_compound_2",
            portfolio_id="PORT_RISK_A",
            exception_code="DUPLICATE_UTR",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=300000,
            actual_paisa=300000,
            delta_paisa=0,
            confidence_score=0.91,
            explanation="Velocity spike with single IP cluster origin collision",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=2)
        ))

        # Fixture 3: Single Signal: Refund Anomaly alone (MEDIUM)
        session.add(ReconciliationCase(
            case_id="case_p9_single_refund",
            portfolio_id="PORT_RISK_A",
            exception_code="REFUND_EXCESS",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            expected_paisa=120000,
            actual_paisa=100000,
            delta_paisa=20000,
            confidence_score=0.86,
            explanation="Customer refund exceeded standard cap",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=5)
        ))

        # Fixture 4: Single Signal: Settlement Gap alone (LOW)
        session.add(ReconciliationCase(
            case_id="case_p9_single_gap",
            portfolio_id="PORT_RISK_A",
            exception_code="MISSING_SETTLEMENT",
            severity="LOW",
            status=CaseStatus.AUTO_RESOLVED,
            expected_paisa=50000,
            actual_paisa=50000,
            delta_paisa=0,
            confidence_score=0.99,
            explanation="Settlement gap resolved by next window",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=7),
            resolved_at=now - timedelta(days=7),
            resolved_by="system"
        ))

        # Fixture 5: Case in PORT_RISK_B: All Three concurrent (CRITICAL)
        session.add(ReconciliationCase(
            case_id="case_p9_port_b",
            portfolio_id="PORT_RISK_B",
            exception_code="UNMATCHED",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=800000,
            actual_paisa=0,
            delta_paisa=800000,
            confidence_score=0.99,
            explanation="Velocity spike with refund anomaly and suspicious IP cluster",
            suggested_action="CONTAINMENT",
            opened_at=now - timedelta(days=1)
        ))

        session.add(AuditState(id=1, last_index=-1, last_hash="0" * 64))
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

# ── Test 1: Heatmap Matrix Co-occurrence & Symmetry ───────────────────────────
def test_risk_correlation_heatmap_known_fixtures(client):
    """
    Assert that the heatmap matrix accurately reflects the deliberately seeded
    co-occurrence fixtures and maintains mathematical symmetry M[s1][s2] == M[s2][s1].
    """
    rev_tok = _get_token(client, "reviewer9@test.com")
    res = client.get("/api/analytics/risk-correlation", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    data = res.json()

    matrix = {row["signal"]: row for row in data["correlation_matrix"]}

    # In PORT_RISK_A:
    # Velocity Spike cases: case 1 (critical) + case 2 (critical/velocity text) = 2
    # Refund Anomaly cases: case 1 + case 3 = 2
    # IP Clustering cases: case 2 = 1
    # Settlement Gap cases: case 4 = 1
    assert matrix["velocity_spike"]["velocity_spike"] == 2
    assert matrix["refund_anomaly"]["refund_anomaly"] == 2
    assert matrix["ip_clustering"]["ip_clustering"] == 1
    assert matrix["settlement_gap"]["settlement_gap"] == 1

    # Co-occurrence pair (Velocity Spike + Refund Anomaly) = 1 (case 1)
    assert matrix["velocity_spike"]["refund_anomaly"] == 1
    assert matrix["refund_anomaly"]["velocity_spike"] == 1  # Symmetry

    # Co-occurrence pair (Velocity Spike + IP Clustering) = 1 (case 2)
    assert matrix["velocity_spike"]["ip_clustering"] == 1
    assert matrix["ip_clustering"]["velocity_spike"] == 1  # Symmetry

    # No co-occurrence between Refund Anomaly and IP Clustering in PORT_RISK_A
    assert matrix["refund_anomaly"]["ip_clustering"] == 0
    assert matrix["ip_clustering"]["refund_anomaly"] == 0

# ── Test 2: Risk Event Timeline & Clustering ─────────────────────────────────
def test_risk_event_timeline_and_clustering(client):
    """
    Assert that the timeline data correctly identifies temporal clustering
    of risk events by date and severity level.
    """
    rev_tok = _get_token(client, "reviewer9@test.com")
    res = client.get("/api/analytics/risk-correlation", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    data = res.json()

    timeline = data["timeline_summary"]
    assert len(timeline) > 0

    # Events from 2 days ago (cases 1 & 2) represent temporal clustering
    two_days_ago_date = (utc_now() - timedelta(days=2)).date().isoformat()
    cluster_bucket = next((b for b in timeline if b["date"] == two_days_ago_date), None)
    assert cluster_bucket is not None
    # 2 cases with 2 signals each = 4 risk events on this date
    assert cluster_bucket["total_events"] == 4
    assert cluster_bucket["critical_count"] >= 1
    assert cluster_bucket["high_count"] >= 1

    # Individual events list
    events = data["events"]
    assert len(events) == 6  # 2 + 2 + 1 + 1 in PORT_RISK_A
    for e in events:
        assert "id" in e
        assert "signal_type" in e
        assert "severity" in e
        assert "timestamp" in e
        assert "z_score" in e
        assert e["z_score"] >= 1.5

# ── Test 3: Multi-Signal Rule I1 Verification & Scoping ──────────────────────
def test_multi_signal_rule_i1_and_scoping(client):
    """
    Assert that Multi-Signal Correlation Rule I1 identifies cases with >= 2 concurrent
    signals and that portfolio scoping isolates reviewers while allowing Admin full view.
    """
    rev_tok = _get_token(client, "reviewer9@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Reviewer 9 (PORT_RISK_A):
    res_rev = client.get("/api/analytics/risk-correlation", cookies={"session_token": rev_tok})
    data_rev = res_rev.json()
    assert data_rev["portfolio_scope"] == "PORT_RISK_A"
    # In PORT_RISK_A, exactly 2 cases have >= 2 concurrent signals (cases 1 & 2)
    multi_signal_events = [e for e in data_rev["events"] if e["is_multi_signal"]]
    multi_cases = set(e["case_id"] for e in multi_signal_events)
    assert len(multi_cases) == 2
    assert "case_p9_compound_1" in multi_cases
    assert "case_p9_compound_2" in multi_cases
    assert "case_p9_port_b" not in multi_cases  # Strict scoping

    # 2. Admin (COMPANY_WIDE):
    # Includes PORT_RISK_B compound case (case_p9_port_b with all 3 signals)
    res_admin = client.get("/api/analytics/risk-correlation", cookies={"session_token": admin_tok})
    data_admin = res_admin.json()
    assert data_admin["portfolio_scope"] == "COMPANY_WIDE"
    admin_multi_cases = set(e["case_id"] for e in data_admin["events"] if e["is_multi_signal"])
    assert len(admin_multi_cases) == 3
    assert "case_p9_port_b" in admin_multi_cases
