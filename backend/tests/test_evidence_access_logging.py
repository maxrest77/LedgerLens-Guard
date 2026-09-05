from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime
import hashlib
import os

from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, EvidenceAttachment, CaseStatus
from backend.audit.chain import AuditBlock, verify_chain, get_pii_hash
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_access_log.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine, tmp_path):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # Create reviewers
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewerX@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_X"))
        session.add(Reviewer(email="reviewerY@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_Y"))
        
        # Create in-scope case
        session.add(ReconciliationCase(
            case_id="case_pack_1",
            portfolio_id="PORTFOLIO_X",
            exception_code="AMOUNT_MISMATCH",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=100000,
            actual_paisa=95000,
            delta_paisa=5000,
            confidence_score=0.98,
            explanation="Test case for evidence access logging",
            suggested_action="MANUAL_REVIEW",
            opened_at=utc_now()
        ))
        session.commit()
        
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_download_evidence_pack_logs_chain_event(client, engine):
    # 1. Login as reviewerX (in-scope for PORTFOLIO_X)
    res_login = client.post("/auth/login", data={"username": "reviewerX@test.com", "password": "pass"})
    assert res_login.status_code == 200
    token = res_login.json()["access_token"]
    
    # Check chain block count before download
    with Session(engine) as session:
        blocks_before = session.exec(select(AuditBlock).where(AuditBlock.case_id == "case_pack_1")).all()
        count_before = len(blocks_before)

    # 2. Download Evidence Pack PDF
    res_pdf = client.get(
        "/export/exception/case_pack_1/pdf",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_pdf.status_code == 200
    assert res_pdf.headers.get("content-type") == "application/pdf"
    assert len(res_pdf.content) > 0

    # 3. Assert a new EVIDENCE_RETRIEVED entry exists in the chain
    with Session(engine) as session:
        blocks_after = session.exec(
            select(AuditBlock)
            .where(AuditBlock.case_id == "case_pack_1")
            .order_by(AuditBlock.index.asc())
        ).all()
        assert len(blocks_after) == count_before + 1
        
        new_block = blocks_after[-1]
        assert new_block.action == "EVIDENCE_RETRIEVED"
        assert new_block.case_id == "case_pack_1"
        # Reviewer is hashed for DPDP privacy in block.reviewer
        assert new_block.reviewer == get_pii_hash("reviewerX@test.com")
        assert "Evidence Pack PDF retrieved" in new_block.reason
        assert "EVIDENCE_PACK_PDF" in new_block.payload_snapshot

        # 4. Assert verify_chain() still passes
        result = verify_chain(session)
        assert result["valid"] is True

def test_download_attached_evidence_file_logs_chain_event(client, engine, tmp_path):
    # 1. Attach sample file
    file_bytes = b"SAMPLE BANK ADVICE SLIP CONTENT"
    sha = hashlib.sha256(file_bytes).hexdigest()
    sample_path = tmp_path / "advice.pdf"
    sample_path.write_bytes(file_bytes)

    att_id = None
    with Session(engine) as session:
        att = EvidenceAttachment(
            case_id="case_pack_1",
            filename="advice.pdf",
            file_type="PDF",
            file_size_bytes=len(file_bytes),
            file_sha256=sha,
            storage_path=str(sample_path),
            uploaded_by="reviewerX@test.com",
            submitter_role="REVIEWER",
            is_committed=True
        )
        session.add(att)
        session.commit()
        session.refresh(att)
        att_id = att.id

    # 2. Login as reviewerX
    res_login = client.post("/auth/login", data={"username": "reviewerX@test.com", "password": "pass"})
    token = res_login.json()["access_token"]

    # 3. Download attached file
    res_down = client.get(
        f"/api/exceptions/case_pack_1/evidence/{att_id}/download",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_down.status_code == 200
    assert res_down.content == file_bytes

    # 4. Assert new EVIDENCE_RETRIEVED entry exists in chain
    with Session(engine) as session:
        blocks = session.exec(
            select(AuditBlock)
            .where(AuditBlock.case_id == "case_pack_1", AuditBlock.action == "EVIDENCE_RETRIEVED")
        ).all()
        assert len(blocks) >= 1
        last_block = blocks[-1]
        assert last_block.reviewer == get_pii_hash("reviewerX@test.com")
        assert "advice.pdf" in last_block.reason
        assert "ATTACHED_FILE" in last_block.payload_snapshot

        # 5. Assert verify_chain() passes
        result = verify_chain(session)
        assert result["valid"] is True

def test_portfolio_scoping_blocks_out_of_scope_evidence_access(client, engine):
    # reviewerY (PORTFOLIO_Y) attempts to access case_pack_1 (PORTFOLIO_X) -> expect 403
    res_login_y = client.post("/auth/login", data={"username": "reviewerY@test.com", "password": "pass"})
    token_y = res_login_y.json()["access_token"]

    res_pdf_blocked = client.get(
        "/export/exception/case_pack_1/pdf",
        headers={"Authorization": f"Bearer {token_y}"}
    )
    assert res_pdf_blocked.status_code == 403
    assert res_pdf_blocked.json()["detail"] == "CASE_OUT_OF_SCOPE"

    # Verify no EVIDENCE_RETRIEVED block was added for reviewerY
    with Session(engine) as session:
        blocks = session.exec(
            select(AuditBlock)
            .where(AuditBlock.case_id == "case_pack_1", AuditBlock.reviewer == get_pii_hash("reviewerY@test.com"))
        ).all()
        assert len(blocks) == 0
