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
from backend.audit.chain import AuditBlock, append_to_chain
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_analytics_phase3.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # 1. Reviewers with ADMIN and REVIEWER roles
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewerA@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))
        session.add(Reviewer(email="reviewerB@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_B"))
        
        # Erased reviewer for DPDP test
        session.add(Reviewer(email="erased_user_hash123", hashed_password="[ERASED]", role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))

        now = utc_now()
        # 2. Cases in PORTFOLIO_A
        session.add(ReconciliationCase(
            case_id="case_a1",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=50000,
            actual_paisa=48000,
            delta_paisa=2000,
            confidence_score=0.95,
            explanation="Open fee deviation",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=5),
            resolved_by=None
        ))
        session.add(ReconciliationCase(
            case_id="case_a2",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=100000,
            actual_paisa=80000,
            delta_paisa=20000,
            confidence_score=0.98,
            explanation="Critical mismatch",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=2),
            resolved_by=None
        ))
        session.add(ReconciliationCase(
            case_id="case_a3",
            portfolio_id="PORTFOLIO_A",
            exception_code="FEE_DEVIATION",
            severity="LOW",
            status=CaseStatus.APPROVED,
            expected_paisa=10000,
            actual_paisa=10000,
            delta_paisa=0,
            confidence_score=0.99,
            explanation="Resolved fee",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=10),
            resolved_at=now - timedelta(days=9),
            resolved_by="reviewerA@test.com"
        ))

        # 3. Cases in PORTFOLIO_B
        session.add(ReconciliationCase(
            case_id="case_b1",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=90000,
            actual_paisa=0,
            delta_paisa=90000,
            confidence_score=0.92,
            explanation="Missing settlement in B",
            suggested_action="MANUAL_SETTLE",
            opened_at=now - timedelta(days=8),
            resolved_by=None
        ))

        # 4. Chain state & blocks
        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
        session.commit()

        append_to_chain(
            session=session,
            case_id="case_a3",
            reviewer="reviewerA@test.com",
            action="APPROVE",
            reason="Approved valid fee",
            payload_snapshot={"delta_paisa": 0}
        )
        session.commit()

        # 5. Chain Anchor
        session.add(ChainAnchor(
            block_index=0,
            chain_hash="test_chain_hash_phase3",
            ots_proof_blob=b"OTS_BYTES",
            gist_url="https://gist.github.com/ledgerlens/phase3",
            status="CONFIRMED",
            created_at=now - timedelta(hours=1)
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

# ── Test 1: REVIEWER sees portfolio-scoped internal analytics ─────────────────
def test_reviewer_scoped_internal_analytics(client):
    rev_tok = _get_token(client, "reviewerA@test.com")
    
    # 1. /api/analytics/internal/summary -> 200, scoped to PORTFOLIO_A
    client.cookies.clear()
    res = client.get("/api/analytics/internal/summary", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    summary = res.json()
    assert summary["scope"] == "PORTFOLIO_A"
    assert summary["exposure"]["total_unresolved_cases"] == 2
    assert summary["exposure"]["total_exposure_paisa"] == 22000

    # 2. /api/analytics/internal/trends -> 200
    client.cookies.clear()
    res = client.get("/api/analytics/internal/trends", cookies={"session_token": rev_tok})
    assert res.status_code == 200

    # 3. /api/analytics/internal/portfolios -> 200, only PORTFOLIO_A
    client.cookies.clear()
    res = client.get("/api/analytics/internal/portfolios", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    data = res.json()
    assert len(data["portfolios"]) == 1
    assert data["portfolios"][0]["portfolio_id"] == "PORTFOLIO_A"

    # 4. /api/analytics/internal/team -> 200, only reviewers in PORTFOLIO_A
    client.cookies.clear()
    res = client.get("/api/analytics/internal/team", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    team_emails = [r["reviewer_email"] for r in res.json()["reviewers"]]
    assert "reviewerA@test.com" in team_emails
    assert "reviewerB@test.com" not in team_emails

# ── Test 2: ADMIN sees company-wide data ──────────────────────────────────────
def test_admin_sees_company_wide(client):
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Portfolios -> Sees all portfolios
    client.cookies.clear()
    res = client.get("/api/analytics/internal/portfolios", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    p_ids = [p["portfolio_id"] for p in res.json()["portfolios"]]
    assert "PORTFOLIO_A" in p_ids
    assert "PORTFOLIO_B" in p_ids

    # 2. Team -> Sees reviewers across all portfolios
    client.cookies.clear()
    res = client.get("/api/analytics/internal/team", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    team_emails = [r["reviewer_email"] for r in res.json()["reviewers"]]
    assert "reviewerA@test.com" in team_emails
    assert "reviewerB@test.com" in team_emails

    # 3. Summary / Exposure & Compliance
    client.cookies.clear()
    res = client.get("/api/analytics/internal/summary", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    summary = res.json()
    assert summary["scope"] == "COMPANY_WIDE"
    # Total company exposure: case_a1 (2000) + case_a2 (20000) + case_b1 (90000) = 112000 paisa
    assert summary["exposure"]["total_unresolved_cases"] == 3
    assert summary["exposure"]["total_exposure_paisa"] == 112000
    assert summary["exposure"]["total_exposure_inr"] == 1120.0
    assert summary["exposure"]["severity_breakdown"]["CRITICAL"]["count"] == 2  # case_a2 + case_b1

    # Compliance checks
    assert summary["compliance"]["dpdp_erasure_requests_processed"] == 1  # 1 erased reviewer
    assert summary["compliance"]["pii_pseudonymization_status"] == "ENFORCED"

    # Chain status checks
    assert summary["chain_status"]["is_valid"] is True
    assert summary["chain_status"]["status"] == "HEALTHY"
    assert summary["chain_status"]["block_count"] >= 1
    assert summary["chain_status"]["verification_uptime_pct"] >= 99.0
