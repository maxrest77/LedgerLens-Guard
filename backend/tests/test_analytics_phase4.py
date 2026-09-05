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
    db_file = tmp_path / "test_analytics_phase4.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # 1. Reviewers with distinct roles & portfolios: ADMIN and REVIEWER
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewer1@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))

        # 2. Cases
        now = utc_now()
        session.add(ReconciliationCase(
            case_id="case_ovr_1",
            portfolio_id="PORTFOLIO_A",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.APPROVED,
            expected_paisa=100000,
            actual_paisa=80000,
            delta_paisa=20000,
            confidence_score=0.99,
            explanation="Override case A",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=2),
            resolved_by="admin@test.com"
        ))
        session.add(ReconciliationCase(
            case_id="case_ovr_2",
            portfolio_id="PORTFOLIO_B",
            exception_code="MISSING_SETTLEMENT",
            severity="CRITICAL",
            status=CaseStatus.APPROVED,
            expected_paisa=500000,
            actual_paisa=0,
            delta_paisa=500000,
            confidence_score=0.95,
            explanation="Override case B",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=4),
            resolved_by="admin@test.com"
        ))

        # 3. Chain State
        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
        session.commit()

        # 4. Chain Events:
        # Event 1: Standard Review
        append_to_chain(
            session=session,
            case_id="case_ovr_1",
            reviewer="reviewer1@test.com",
            action="APPROVE",
            reason="Standard review",
            payload_snapshot={"delta_paisa": 20000}
        )
        # Event 2: Task 4.2 - ADMIN_CROSS_PORTFOLIO_OVERRIDE for PORTFOLIO_A
        append_to_chain(
            session=session,
            case_id="case_ovr_1",
            reviewer="admin@test.com",
            action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
            reason="Admin cross-portfolio override bypass applied for portfolio PORTFOLIO_A. Reviewer portfolio: GLOBAL",
            payload_snapshot={"portfolio_id": "PORTFOLIO_A", "reviewer": "admin@test.com"}
        )
        # Event 3: Task 4.2 - ADMIN_CROSS_PORTFOLIO_OVERRIDE for PORTFOLIO_B
        append_to_chain(
            session=session,
            case_id="case_ovr_2",
            reviewer="admin@test.com",
            action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
            reason="Admin cross-portfolio override bypass applied for portfolio PORTFOLIO_B. Reviewer portfolio: GLOBAL",
            payload_snapshot={"portfolio_id": "PORTFOLIO_B", "reviewer": "admin@test.com"}
        )
        # Event 4: Task 4.3 - EVIDENCE_RETRIEVED for case_ovr_1
        append_to_chain(
            session=session,
            case_id="case_ovr_1",
            reviewer="auditor@test.com",
            action="EVIDENCE_RETRIEVED",
            reason="Evidence Pack PDF retrieved for case case_ovr_1",
            payload_snapshot={
                "case_id": "case_ovr_1",
                "resource_type": "EVIDENCE_PACK_PDF",
                "files_accessed": ["LedgerLens_Evidence_Pack_case_ovr_1.pdf"],
                "reviewer": "auditor@test.com",
                "timestamp": now.isoformat()
            }
        )
        session.commit()

        # 5. Chain Anchor (for Task 4.1)
        session.add(ChainAnchor(
            block_index=3,
            chain_hash="test_chain_hash_phase4",
            ots_proof_blob=b"OTS_PHASE_4_PROOF",
            gist_url="https://gist.github.com/ledgerlens/phase4_governance",
            status="CONFIRMED",
            created_at=now - timedelta(hours=3)
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

# ── Test Task 4.1: Chain Integrity Meter Data ────────────────────────────────
def test_chain_integrity_meter_data(client):
    rev_tok = _get_token(client, "reviewer1@test.com")
    
    # Accessible to reviewer as well (for Dashboard display)
    client.cookies.clear()
    res = client.get("/api/analytics/chain-status", cookies={"session_token": rev_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is True
    assert data["block_count"] == 4
    assert data["last_verified_at"] is not None
    assert data["last_confirmed_ots"]["status"] == "CONFIRMED"
    assert data["last_confirmed_ots"]["age_hours"] >= 2.9
    assert "gist.github.com" in data["last_gist"]["url"]
    assert data["last_gist"]["age_hours"] >= 2.9

# ── Test Task 4.2: Admin Override Transparency Panel & Scoping ───────────────
def test_admin_overrides_gating_and_scoping(client):
    rev_tok = _get_token(client, "reviewer1@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Plain REVIEWER is forbidden (403)
    client.cookies.clear()
    res = client.get("/api/analytics/admin-overrides", cookies={"session_token": rev_tok})
    assert res.status_code == 403
    res_audit = client.get("/api/audit/admin-overrides", cookies={"session_token": rev_tok})
    assert res_audit.status_code == 403

    # 2. ADMIN sees all overrides (PORTFOLIO_A and PORTFOLIO_B)
    client.cookies.clear()
    res = client.get("/api/analytics/admin-overrides", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    overrides = res.json()["overrides"]
    assert len(overrides) == 2
    portfolios = [o["portfolio"] for o in overrides]
    assert "PORTFOLIO_A" in portfolios
    assert "PORTFOLIO_B" in portfolios

# ── Test Task 4.3: Evidence Retrieval Activity Feed ──────────────────────────
def test_evidence_retrieval_feed_gating_and_data(client):
    rev_tok = _get_token(client, "reviewer1@test.com")
    admin_tok = _get_token(client, "admin@test.com")

    # 1. Plain REVIEWER is forbidden (403)
    client.cookies.clear()
    res = client.get("/api/analytics/evidence-retrievals", cookies={"session_token": rev_tok})
    assert res.status_code == 403
    res_audit = client.get("/api/audit/evidence-retrievals", cookies={"session_token": rev_tok})
    assert res_audit.status_code == 403

    # 2. ADMIN sees the live retrieval event
    client.cookies.clear()
    res = client.get("/api/analytics/evidence-retrievals", cookies={"session_token": admin_tok})
    assert res.status_code == 200
    data = res.json()
    assert data["total_retrievals"] == 1
    item = data["retrievals"][0]
    assert item["case_id"] == "case_ovr_1"
    assert "LedgerLens_Evidence_Pack_case_ovr_1.pdf" in item["files_accessed"]
    assert item["resource_type"] == "EVIDENCE_PACK_PDF"
