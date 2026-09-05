from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timedelta

from backend.api.main import app
from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus,
    ChainAnchor, AuditState
)
from backend.audit.chain import AuditBlock, append_to_chain, verify_chain
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # 1. Reviewers: ADMIN and REVIEWER
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewerA@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))
        session.add(Reviewer(email="reviewerB@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_B"))
        
        # 2. Cases in PORTFOLIO_A
        now = utc_now()
        session.add(ReconciliationCase(
            case_id="case_a1",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="HIGH",
            status=CaseStatus.APPROVED,
            expected_paisa=50000,
            actual_paisa=48000,
            delta_paisa=2000,
            confidence_score=0.95,
            explanation="Fee deviation resolved",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=10),
            resolved_at=now - timedelta(days=9),
            resolved_by="reviewerA@test.com",
            reason_flagged=False
        ))
        session.add(ReconciliationCase(
            case_id="case_a2",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="MEDIUM",
            status=CaseStatus.OPEN,
            expected_paisa=30000,
            actual_paisa=27000,
            delta_paisa=3000,
            confidence_score=0.88,
            explanation="Open fee mismatch",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=5),
            resolved_by=None
        ))
        session.add(ReconciliationCase(
            case_id="case_a3",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.REJECTED,
            expected_paisa=100000,
            actual_paisa=90000,
            delta_paisa=10000,
            confidence_score=0.99,
            explanation="Rejected fraudulent mismatch",
            suggested_action="REJECT",
            opened_at=now - timedelta(days=3),
            resolved_at=now - timedelta(days=2),
            resolved_by="reviewerA@test.com",
            reason_flagged=True,  # flagged reason by D2 check
            flag_reason="Suspicious repetitive text"
        ))

        # 3. Cases in PORTFOLIO_B
        session.add(ReconciliationCase(
            case_id="case_b1",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=75000,
            actual_paisa=0,
            delta_paisa=75000,
            confidence_score=0.91,
            explanation="Missing bank settlement entry",
            suggested_action="MANUAL_SETTLE",
            opened_at=now - timedelta(days=20),
            resolved_by=None
        ))
        
        # 4. Chain state & blocks
        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
        session.commit()
        
        append_to_chain(
            session=session,
            case_id="case_a1",
            reviewer="reviewerA@test.com",
            action="APPROVE",
            reason="Approved valid fee deduction",
            payload_snapshot={"delta_paisa": 2000}
        )
        session.commit()
        
        # 5. ChainAnchor record
        session.add(ChainAnchor(
            block_index=0,
            chain_hash="test_chain_hash_123",
            ots_proof_blob=b"OTS_PROOF_BYTES_MOCK",
            gist_url="https://gist.github.com/ledgerlens/anchortest",
            status="CONFIRMED",
            created_at=now - timedelta(hours=2)
        ))
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

# ── Test 1.1: Trends ──────────────────────────────────────────────────────────
def test_analytics_trends_admin_and_scoped(client):
    admin_tok = _get_token(client, "admin@test.com")
    revA_tok = _get_token(client, "reviewerA@test.com")

    # 1. Admin sees company-wide trends (both PORTFOLIO_A and PORTFOLIO_B = 4 total cases)
    client.cookies.clear()
    res_admin = client.get("/api/analytics/trends?period=weekly&range=90d", cookies={"session_token": admin_tok})
    assert res_admin.status_code == 200
    data_admin = res_admin.json()
    assert data_admin["total_exceptions"] == 4
    assert len(data_admin["series"]) > 0
    total_unresolved = sum(s["unresolved_delta_paisa"] for s in data_admin["series"])
    assert total_unresolved == 3000 + 75000  # case_a2 + case_b1

    # 2. Reviewer A is strictly scoped to PORTFOLIO_A (3 cases, never see case_b1's 75,000 delta)
    client.cookies.clear()
    res_revA = client.get("/api/analytics/trends?period=weekly&range=90d", cookies={"session_token": revA_tok})
    assert res_revA.status_code == 200
    data_revA = res_revA.json()
    assert data_revA["scoped_portfolio"] == "PORTFOLIO_A"
    assert data_revA["total_exceptions"] == 3
    total_unresolved_a = sum(s["unresolved_delta_paisa"] for s in data_revA["series"])
    assert total_unresolved_a == 3000  # Only case_a2

# ── Test 1.2: Portfolio Breakdown ─────────────────────────────────────────────
def test_analytics_portfolios_scoping(client):
    admin_tok = _get_token(client, "admin@test.com")
    revA_tok = _get_token(client, "reviewerA@test.com")

    # 1. Admin sees all portfolios
    client.cookies.clear()
    res_admin = client.get("/api/analytics/portfolios", cookies={"session_token": admin_tok})
    assert res_admin.status_code == 200
    p_admin = {p["portfolio_id"]: p for p in res_admin.json()["portfolios"]}
    assert "PORTFOLIO_A" in p_admin
    assert "PORTFOLIO_B" in p_admin
    
    assert p_admin["PORTFOLIO_A"]["open_case_count"] == 1
    assert p_admin["PORTFOLIO_A"]["total_case_count"] == 3
    assert p_admin["PORTFOLIO_A"]["unresolved_delta_paisa"] == 3000
    assert p_admin["PORTFOLIO_A"]["unresolved_delta_inr"] == 30.0
    assert p_admin["PORTFOLIO_A"]["oldest_open_case_id"] == "case_a2"

    assert p_admin["PORTFOLIO_B"]["open_case_count"] == 1
    assert p_admin["PORTFOLIO_B"]["unresolved_delta_paisa"] == 75000
    assert p_admin["PORTFOLIO_B"]["oldest_open_case_age_days"] >= 19.0

    # 2. Reviewer A receives ONLY PORTFOLIO_A
    client.cookies.clear()
    res_revA = client.get("/api/analytics/portfolios", cookies={"session_token": revA_tok})
    assert res_revA.status_code == 200
    portfolios_a = res_revA.json()["portfolios"]
    assert len(portfolios_a) == 1
    assert portfolios_a[0]["portfolio_id"] == "PORTFOLIO_A"
    assert "PORTFOLIO_B" not in [p["portfolio_id"] for p in portfolios_a]

# ── Test 1.3: Reviewer Performance ────────────────────────────────────────────
def test_analytics_reviewer_performance(client):
    admin_tok = _get_token(client, "admin@test.com")
    revA_tok = _get_token(client, "reviewerA@test.com")

    # 1. scope=self for reviewerA
    client.cookies.clear()
    res_self = client.get("/api/analytics/reviewer-performance?scope=self", cookies={"session_token": revA_tok})
    assert res_self.status_code == 200
    stats = res_self.json()["stats"]
    assert stats["reviewer_email"] == "reviewerA@test.com"
    assert stats["cases_resolved"] == 2  # case_a1 (APPROVED), case_a3 (REJECTED)
    assert stats["approved_count"] == 1
    assert stats["rejected_count"] == 1
    assert stats["approval_ratio"] == 0.5
    assert stats["rejection_ratio"] == 0.5
    assert stats["flagged_reasons_count"] == 1
    assert stats["flag_rate"] == 50.0
    assert stats["avg_time_to_decision_hours"] == 24.0  # (24h + 24h) / 2

    # 2. scope=team accessible for REVIEWER (scoped to PORTFOLIO_A)
    client.cookies.clear()
    res_team_rev = client.get("/api/analytics/reviewer-performance?scope=team", cookies={"session_token": revA_tok})
    assert res_team_rev.status_code == 200
    team_revs = res_team_rev.json()["reviewers"]
    emails = [r["reviewer_email"] for r in team_revs]
    assert "reviewerA@test.com" in emails
    assert "reviewerB@test.com" not in emails  # Scoped out!

    # 3. scope=team for ADMIN is company-wide
    client.cookies.clear()
    res_team_admin = client.get("/api/analytics/reviewer-performance?scope=team", cookies={"session_token": admin_tok})
    assert res_team_admin.status_code == 200
    all_emails = [r["reviewer_email"] for r in res_team_admin.json()["reviewers"]]
    assert "reviewerA@test.com" in all_emails
    assert "reviewerB@test.com" in all_emails

# ── Test 1.4: Fee Impact Rollup ───────────────────────────────────────────────
def test_analytics_fee_impact(client):
    admin_tok = _get_token(client, "admin@test.com")
    revA_tok = _get_token(client, "reviewerA@test.com")

    # 1. Admin company-wide
    client.cookies.clear()
    res_admin = client.get("/api/analytics/fee-impact?range=90d", cookies={"session_token": admin_tok})
    assert res_admin.status_code == 200
    data = res_admin.json()
    assert data["total_cases_analyzed"] == 4
    assert data["total_leakage_paisa"] == 2000 + 3000 + 10000 + 75000  # 90,000 paisa
    assert data["total_leakage_inr"] == 900.0

    codes = {b["exception_code"]: b for b in data["breakdown"]}
    assert "FEE_DEVIATION" in codes
    assert codes["FEE_DEVIATION"]["case_count"] == 2
    assert codes["FEE_DEVIATION"]["total_delta_paisa"] == 5000
    assert codes["FEE_DEVIATION"]["unresolved_delta_paisa"] == 3000
    assert len(codes["FEE_DEVIATION"]["time_series"]) > 0

    # 2. Reviewer A scoped
    client.cookies.clear()
    res_revA = client.get("/api/analytics/fee-impact?range=90d", cookies={"session_token": revA_tok})
    assert res_revA.status_code == 200
    data_a = res_revA.json()
    assert data_a["total_cases_analyzed"] == 3
    assert data_a["total_leakage_paisa"] == 15000  # 2000 + 3000 + 10000

# ── Test 1.5: Chain Status ───────────────────────────────────────────────────
def test_analytics_chain_status(client):
    revA_tok = _get_token(client, "reviewerA@test.com")
    client.cookies.clear()
    res = client.get("/api/analytics/chain-status", cookies={"session_token": revA_tok})
    assert res.status_code == 200
    data = res.json()
    
    assert data["block_count"] >= 1
    assert data["is_valid"] is True
    assert data["last_verified_at"] is not None
    assert data["last_confirmed_ots"]["age_hours"] is not None
    assert data["last_confirmed_ots"]["status"] == "CONFIRMED"
    assert data["last_gist"]["url"] == "https://gist.github.com/ledgerlens/anchortest"
    assert data["last_gist"]["age_hours"] is not None
