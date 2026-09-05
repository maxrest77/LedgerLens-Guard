from backend.utils import utc_now
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timedelta
import hashlib
import json

from backend.api.main import app
from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus,
    DPDPErasureRecord, AuditState
)
from backend.audit.chain import AuditBlock, append_to_chain, verify_chain
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_compliance_phase10.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # 1. Reviewers: ADMIN, AUDITOR, and standard REVIEWER
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="auditor@test.com", hashed_password=get_password_hash("pass"), role=Role.AUDITOR, portfolio_id="GLOBAL"))
        session.add(Reviewer(email="reviewer@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))

        # DPDP Erased reviewer account
        session.add(Reviewer(email="usr_erased_hash_9988", hashed_password="[ERASED]", role=Role.REVIEWER, portfolio_id="PORTFOLIO_A"))

        now = utc_now()

        # 2. Seed DPDP Erasure Record
        session.add(DPDPErasureRecord(
            erasure_id="ERA-2026-0001",
            subject_id="usr_erased_hash_9988",
            request_date=now - timedelta(days=5),
            completed_date=now - timedelta(days=5, hours=-2),
            blocks_pseudonym_verified_count=12,
            dpdp_section_reference="Section 12(1) — Right to Erasure, DPDP Act 2023",
            verification_status="VERIFIED"
        ))

        # 3. Seed Cases
        session.add(ReconciliationCase(
            case_id="case_p10_1",
            portfolio_id="PORTFOLIO_A",
            exception_code="MDR_DISCREPANCY",
            severity="CRITICAL",
            status=CaseStatus.APPROVED,
            expected_paisa=150000,
            actual_paisa=140000,
            delta_paisa=10000,
            confidence_score=0.92,
            explanation="MDR discrepancy exceeding tolerance",
            suggested_action="APPROVE",
            opened_at=now - timedelta(days=4),
            resolved_at=now - timedelta(days=3),
            resolved_by="admin@test.com"
        ))
        session.add(ReconciliationCase(
            case_id="case_p10_2",
            portfolio_id="PORTFOLIO_B",
            exception_code="REFUND_WITHOUT_PAYMENT",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=25000,
            actual_paisa=0,
            delta_paisa=25000,
            confidence_score=0.88,
            explanation="Refund anomaly",
            suggested_action="INVESTIGATE",
            opened_at=now - timedelta(days=2)
        ))

        state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
        session.add(state)
        session.commit()

        # 4. Seed Audit chain events:
        # Event 1: Normal resolution
        append_to_chain(
            session=session,
            case_id="case_p10_1",
            reviewer="admin@test.com",
            action="APPROVE_MATCH",
            reason="Approved with MDR variance within discretionary limit",
            payload_snapshot={"delta_paisa": 10000}
        )
        session.commit()

        # Event 2: Cross-portfolio admin override (Task 10.3)
        append_to_chain(
            session=session,
            case_id="case_p10_2",
            reviewer="admin@test.com",
            action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
            reason="Admin escalated case outside portfolio boundary for high-risk refund review",
            payload_snapshot={
                "portfolio_id": "PORTFOLIO_B",
                "original_status": "OPEN",
                "overridden_status": "ESCALATED"
            }
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

# ── Test 1: Role Access Matrix & Compliance Overview ─────────────────────────
def test_compliance_summary_and_role_access(client):
    admin_tok = _get_token(client, "admin@test.com")
    auditor_tok = _get_token(client, "auditor@test.com")
    rev_tok = _get_token(client, "reviewer@test.com")

    # 1. REVIEWER is forbidden (403)
    client.cookies.clear()
    res = client.get("/api/compliance/summary", cookies={"session_token": rev_tok})
    assert res.status_code == 403

    # 2. AUDITOR has access (200)
    client.cookies.clear()
    res_auditor = client.get("/api/compliance/summary?range=14d", cookies={"session_token": auditor_tok})
    assert res_auditor.status_code == 200
    auditor_data = res_auditor.json()
    assert auditor_data["current_status"]["is_valid"] is True
    assert auditor_data["current_status"]["total_dpdp_erasures"] >= 1
    assert auditor_data["current_status"]["total_admin_overrides"] >= 1

    # 3. ADMIN has access (200)
    client.cookies.clear()
    res_admin = client.get("/api/compliance/summary?range=30d", cookies={"session_token": admin_tok})
    assert res_admin.status_code == 200
    data = res_admin.json()

    # Task 10.1: Chain uptime history assertions
    assert "verification_history" in data
    assert len(data["verification_history"]) > 0
    latest_check = data["verification_history"][-1]
    assert latest_check["status"] == "VALID"
    assert latest_check["success_rate_pct"] == 100.0

# ── Test 2: DPDP Erasure Log & Override Trends ────────────────────────────────
def test_dpdp_erasure_log_and_admin_overrides(client):
    admin_tok = _get_token(client, "admin@test.com")

    # 1. DPDP Erasure Log (Task 10.2)
    client.cookies.clear()
    res_erasure = client.get("/api/compliance/erasure-log", cookies={"session_token": admin_tok})
    assert res_erasure.status_code == 200
    erasure_data = res_erasure.json()
    assert erasure_data["total_requests"] >= 1
    rec = erasure_data["records"][0]
    assert rec["erasure_id"].startswith("ERA-")
    assert "usr_erased_hash_9988" in rec["subject_id"]
    assert rec["blocks_pseudonym_verified_count"] >= 1
    assert "blocks_rewritten_count" not in rec
    assert "DPDP Act 2023" in rec["dpdp_section_reference"]
    assert rec["verification_status"] == "VERIFIED"
    assert len(erasure_data["trend"]) > 0

    # 2. Admin Overrides History & Trend (Task 10.3)
    client.cookies.clear()
    res_override = client.get("/api/compliance/admin-overrides", cookies={"session_token": admin_tok})
    assert res_override.status_code == 200
    ovr_data = res_override.json()
    assert ovr_data["total_overrides"] >= 1
    ovr = ovr_data["records"][0]
    assert ovr["override_id"].startswith("OVR-")
    assert ovr["exception_id"] == "case_p10_2"
    assert "Admin escalated case outside portfolio boundary" in ovr["justification"]
    assert ovr["audit_block_ref"].startswith("#")
    assert len(ovr_data["trend"]) > 0

# ── Test 3: Regulator Production Package Generation E2E ───────────────────────
def test_generate_regulator_production_package_e2e(client, engine):
    auditor_tok = _get_token(client, "auditor@test.com")

    client.cookies.clear()
    payload = {
        "start_date": None,
        "end_date": None,
        "portfolio_scope": "GLOBAL",
        "notes": "Semi-Annual RBI Cyber Security and DPDP Statutory Audit Inspection"
    }
    res = client.post(
        "/api/compliance/regulatory-package",
        json=payload,
        cookies={"session_token": auditor_tok},
        headers={"X-CSRF-Protection": "1"}
    )
    assert res.status_code == 200
    data = res.json()

    # 1. Verify response structure and package ID
    assert data["status"] == "SUCCESS"
    package_id = data["package_id"]
    assert package_id.startswith("REG-PROD-")

    # 2. Verify Manifest fields
    manifest = data["manifest"]
    assert manifest["package_id"] == package_id
    assert manifest["cases_count"] >= 2
    assert "case_p10_1" in manifest["case_ids"]
    assert "case_p10_2" in manifest["case_ids"]
    assert manifest["chain_verification_status"] == "CRYPTOGRAPHICALLY_VERIFIED"
    assert "opentimestamps_proof_reference" in manifest
    assert "payload_sha256" in manifest

    # 3. Verify that REGULATORY_PRODUCTION_GENERATED block was appended into chain
    with Session(engine) as session:
        prod_block = session.exec(
            select(AuditBlock).where(AuditBlock.action == "REGULATORY_PRODUCTION_GENERATED")
        ).first()
        assert prod_block is not None
        assert prod_block.case_id == package_id
        assert manifest["production_block_index"] == prod_block.index
        assert manifest["production_block_hash"] == prod_block.block_hash
        assert manifest["payload_sha256"] in prod_block.reason

        # 4. Verify that verify_chain() returns valid
        verify_res = verify_chain(session)
        assert verify_res["valid"] is True
        assert verify_res["tampered_at_index"] is None

    # 5. Verify Certificate contents
    cert = data["certificate"]
    assert "REGULATORY PRODUCTION VERIFICATION CERTIFICATE" in cert
    assert package_id in cert
    assert manifest["payload_sha256"] in cert
    assert "RBI Cyber Security Framework" in cert

    # 6. Verify file download endpoints
    client.cookies.clear()
    res_cert = client.get(f"/api/compliance/download-package/{package_id}/certificate.txt", cookies={"session_token": auditor_tok})
    assert res_cert.status_code == 200
    assert "REGULATORY PRODUCTION VERIFICATION CERTIFICATE" in res_cert.text

    res_csv = client.get(f"/api/compliance/download-package/{package_id}/cases.csv", cookies={"session_token": auditor_tok})
    assert res_csv.status_code == 200
    assert "case_id,portfolio_id,exception_code" in res_csv.text

    res_manifest = client.get(f"/api/compliance/download-package/{package_id}/manifest.json", cookies={"session_token": auditor_tok})
    assert res_manifest.status_code == 200
    assert res_manifest.json()["package_id"] == package_id
