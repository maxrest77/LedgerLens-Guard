import pytest
from datetime import datetime
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth import get_db, get_password_hash, create_access_token
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus, ApprovalRequest
from backend.audit.chain import AuditBlock, verify_chain, get_pii_hash
from backend.scripts.dpdp_erasure import erase_principal
from backend.utils.time_utils import utc_now


def test_continuous_hash_chain_full_lifecycle():
    """
    B3: Full hash-chain re-verification test covering the complete lifecycle:
    1. Seed initial data (Reviewers with different portfolios and roles, Critical & Non-critical cases)
    2. Maker initiates review on CRITICAL case -> transitions to PENDING_CO_REVIEW
    3. Checker (Admin/Senior Approver) approves -> transitions to APPROVED, committed to audit chain
    4. DPDP Section 12 erasure executed on Maker -> crypto-shredded with HMAC pseudonymization
    5. Admin cross-portfolio override executed -> logs ADMIN_CROSS_PORTFOLIO_OVERRIDE block
    6. Verify /api/audit/verify returns valid: True, tampered_at_index: None, with entire chain intact.
    """
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    maker_email = "maker_b3@ledgerlens.internal"
    checker_email = "checker_b3@ledgerlens.internal"
    admin_cross_email = "admin_cross@ledgerlens.internal"

    maker_hash = get_pii_hash(maker_email)

    # 1. Seed initial data
    with Session(test_engine) as session:
        maker = Reviewer(
            email=maker_email,
            hashed_password=get_password_hash("pw"),
            role=Role.REVIEWER,
            portfolio_id="PORTFOLIO_ALPHA"
        )
        checker = Reviewer(
            email=checker_email,
            hashed_password=get_password_hash("pw"),
            role=Role.ADMIN,
            portfolio_id="PORTFOLIO_ALPHA"
        )
        admin_cross = Reviewer(
            email=admin_cross_email,
            hashed_password=get_password_hash("pw"),
            role=Role.ADMIN,
            portfolio_id="PORTFOLIO_BETA"
        )
        crit_case = ReconciliationCase(
            case_id="case_b3_crit",
            portfolio_id="PORTFOLIO_ALPHA",
            exception_code="FEE_RATE_MISMATCH",
            severity="CRITICAL",
            status=CaseStatus.OPEN,
            expected_paisa=5000000,
            actual_paisa=4800000,
            delta_paisa=200000,
            confidence_score=0.98,
            explanation="Critical MDR fee divergence requiring maker-checker authorization",
            suggested_action="Review contract fee schedule",
            opened_at=utc_now()
        )
        cross_case = ReconciliationCase(
            case_id="case_b3_cross",
            portfolio_id="PORTFOLIO_ALPHA",
            exception_code="MDR_DISCREPANCY",
            severity="LOW",
            status=CaseStatus.OPEN,
            expected_paisa=150000,
            actual_paisa=149000,
            delta_paisa=1000,
            confidence_score=0.99,
            explanation="Minor discrepancy in portfolio ALPHA",
            suggested_action="Standard approval",
            opened_at=utc_now()
        )
        session.add_all([maker, checker, admin_cross, crit_case, cross_case])
        session.commit()

    def override_db():
        with Session(test_engine) as s:
            yield s

    app.dependency_overrides[get_db] = override_db
    try:
        client = TestClient(app)

        maker_tok = create_access_token(data={"sub": maker_email})
        checker_tok = create_access_token(data={"sub": checker_email})
        admin_cross_tok = create_access_token(data={"sub": admin_cross_email})

        # 2. Maker submits review on CRITICAL case -> PENDING_CO_REVIEW
        res_maker = client.post(
            "/api/exceptions/case_b3_crit/review",
            json={
                "action": "APPROVE",
                "reason": "Validated gateway invoice against merchant settlement report."
            },
            headers={
                "Authorization": f"Bearer {maker_tok}",
                "X-CSRF-Protection": "1",
                "Idempotency-Key": "idem-maker-b3-01"
            }
        )
        assert res_maker.status_code == 200
        assert res_maker.json()["case"]["status"] == "PENDING_CO_REVIEW"

        # 3. Checker approves -> APPROVED
        res_checker = client.post(
            "/api/exceptions/case_b3_crit/review",
            json={
                "action": "APPROVE",
                "reason": "Co-reviewer verified and confirmed clearinghouse match."
            },
            headers={
                "Authorization": f"Bearer {checker_tok}",
                "X-CSRF-Protection": "1",
                "Idempotency-Key": "idem-checker-b3-02"
            }
        )
        assert res_checker.status_code == 200
        assert res_checker.json()["case"]["status"] == "APPROVED"

        # 4. DPDP Section 12 Erasure on Maker
        with Session(test_engine) as session:
            erasure_ok = erase_principal(session, maker_email)
            assert erasure_ok is True
            session.commit()

        # Check DB post-erasure: maker is crypto-shredded
        with Session(test_engine) as session:
            c = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == "case_b3_crit")).first()
            assert c.resolved_by == maker_hash
            erased_maker = session.exec(select(Reviewer).where(Reviewer.email == maker_email)).first()
            assert erased_maker is None
            shredded = session.exec(select(Reviewer).where(Reviewer.email == maker_hash)).first()
            assert shredded is not None
            assert shredded.hashed_password == "[ERASED]"

        # 5. Admin cross-portfolio override executed on cross_case (portfolio ALPHA reviewed by BETA admin)
        res_override = client.post(
            "/api/exceptions/case_b3_cross/review",
            json={
                "action": "APPROVE",
                "reason": "Senior admin overriding cross-portfolio case for urgent clearing."
            },
            headers={
                "Authorization": f"Bearer {admin_cross_tok}",
                "X-CSRF-Protection": "1",
                "Idempotency-Key": "idem-cross-b3-03"
            }
        )
        assert res_override.status_code == 200
        assert res_override.json()["case"]["status"] == "APPROVED"

        # 6. Verify full chain via /api/audit/verify endpoint
        res_verify = client.get(
            "/api/audit/verify",
            headers={
                "Authorization": f"Bearer {checker_tok}",
                "X-CSRF-Protection": "1"
            }
        )
        assert res_verify.status_code == 200
        verify_data = res_verify.json()
        assert verify_data["valid"] is True
        assert verify_data["tampered_at_index"] is None

        # Inspect all audit blocks directly to verify integrity
        with Session(test_engine) as session:
            chain_result = verify_chain(session)
            assert chain_result["valid"] is True
            assert chain_result["tampered_at_index"] is None

            blocks = session.exec(select(AuditBlock).order_by(AuditBlock.index.asc())).all()
            assert len(blocks) >= 2

            actions = [b.action for b in blocks]
            assert "ADMIN_CROSS_PORTFOLIO_OVERRIDE" in actions

            # Verify no raw PII of erased user in any block
            for b in blocks:
                assert maker_email not in b.reviewer
                assert maker_email not in b.payload_snapshot

    finally:
        app.dependency_overrides.clear()
