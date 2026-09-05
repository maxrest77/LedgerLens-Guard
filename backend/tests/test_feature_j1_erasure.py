import os
import pytest
from datetime import datetime
from backend.utils.time_utils import utc_now
from sqlmodel import Session, create_engine, SQLModel, select
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus
from backend.audit.chain import append_to_chain, verify_chain, AuditBlock
from backend.scripts.dpdp_erasure import erase_principal, get_pii_hash

def test_erasure_workflow(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test_erasure.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    email = "test@example.com"
    pseudonym = get_pii_hash(email)
    
    with Session(engine) as session:
        # Setup Reviewer
        rev = Reviewer(email=email, hashed_password="pw", role=Role.REVIEWER)
        session.add(rev)
        
        # Setup Case
        case = ReconciliationCase(
            case_id="case_1",
            exception_code="TEST",
            severity="LOW",
            expected_paisa=1000,
            actual_paisa=1000,
            explanation="",
            suggested_action="",
            delta_paisa=0,
            confidence_score=1.0,
            status=CaseStatus.APPROVED,
            opened_at=utc_now(),
            resolved_by=email
        )
        session.add(case)
        session.flush()
        
        # Add to chain
        append_to_chain(
            session=session,
            case_id=case.case_id,
            reviewer=email,
            action="RESOLVE",
            reason="Approved",
            payload_snapshot=case.model_dump(mode="json")
        )
        session.commit()
        
    # Verify baseline chain is valid
    with Session(engine) as session:
        res = verify_chain(session)
        assert res["valid"] is True
        
    with Session(engine) as session:
        block = session.exec(select(AuditBlock)).first()
        assert email not in block.reviewer
        assert email not in block.payload_snapshot
        assert pseudonym == block.reviewer
        
        # Execute erasure
        assert erase_principal(session, email) is True
        session.commit()
        
    # Post-erasure checks
    with Session(engine) as session:
        # 1. PII pseudonymized
        erased_case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == "case_1")).first()
        assert erased_case.resolved_by == pseudonym
        
        erased_rev = session.exec(select(Reviewer).where(Reviewer.email == pseudonym)).first()
        assert erased_rev is not None
        assert erased_rev.hashed_password == "[ERASED]"
        
        missing_rev = session.exec(select(Reviewer).where(Reviewer.email == email)).first()
        assert missing_rev is None
        
        # 2. verify_chain() still passes
        res = verify_chain(session)
        assert res["valid"] is True
        
        # 3. Transaction amounts, case status unchanged
        assert erased_case.expected_paisa == 1000
        assert erased_case.status == CaseStatus.APPROVED


def test_erasure_end_to_end_api_chain_verification():
    from fastapi.testclient import TestClient
    from backend.api.main import app
    from backend.api.auth import get_db, create_access_token
    from sqlalchemy.pool import StaticPool

    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    admin_email = "admin_audit@ledgerlens.internal"
    erased_email = "subject_erased@ledgerlens.internal"
    erased_pseudonym = get_pii_hash(erased_email)

    with Session(test_engine) as session:
        session.add(Reviewer(email=admin_email, hashed_password="pw", role=Role.ADMIN))
        session.add(Reviewer(email=erased_email, hashed_password="pw", role=Role.REVIEWER))

        # Seed multiple chained reconciliation cases
        for idx, (rev, amt) in enumerate([(erased_email, 5000), (admin_email, 8500), (erased_email, 12000)], 1):
            c = ReconciliationCase(
                case_id=f"case_audit_{idx}",
                exception_code="MDR_DISCREPANCY",
                severity="LOW",
                expected_paisa=amt,
                actual_paisa=amt,
                delta_paisa=0,
                confidence_score=1.0,
                explanation="Audited case",
                suggested_action="Review",
                status=CaseStatus.APPROVED,
                opened_at=utc_now(),
                resolved_by=rev
            )
            session.add(c)
            session.flush()

            append_to_chain(
                session=session,
                case_id=c.case_id,
                reviewer=rev,
                action="APPROVE_MATCH",
                reason=f"Matched settlement via bank confirmation for batch {idx}",
                payload_snapshot=c.model_dump(mode="json")
            )
        session.commit()

    # Pre-erasure verify: chain is valid
    with Session(test_engine) as session:
        assert verify_chain(session)["valid"] is True

    # Execute DPDP Section 12 erasure on erased_email
    with Session(test_engine) as session:
        erased_ok = erase_principal(session, erased_email)
        assert erased_ok is True
        session.commit()

    # Post-erasure verify: chain STILL 100% cryptographically valid
    with Session(test_engine) as session:
        chain_status = verify_chain(session)
        assert chain_status["valid"] is True
        assert chain_status["tampered_at_index"] is None

        # Verify all blocks still exist, unmutated, with pseudonym hashes
        blocks = session.exec(select(AuditBlock).order_by(AuditBlock.index.asc())).all()
        assert len(blocks) == 3
        for b in blocks:
            assert erased_email not in b.reviewer
            assert erased_email not in b.payload_snapshot
        assert blocks[0].reviewer == erased_pseudonym
        assert blocks[2].reviewer == erased_pseudonym

    # Verify through FastAPI /api/audit/verify endpoint using TestClient
    def override_db():
        with Session(test_engine) as s:
            yield s

    app.dependency_overrides[get_db] = override_db
    try:
        client = TestClient(app)
        admin_token = create_access_token(data={"sub": admin_email})
        resp = client.get(
            "/api/audit/verify",
            headers={"Authorization": f"Bearer {admin_token}", "X-CSRF-Protection": "1"}
        )
        assert resp.status_code == 200
        verify_json = resp.json()
        assert verify_json["valid"] is True
        assert verify_json["tampered_at_index"] is None
    finally:
        app.dependency_overrides.clear()

