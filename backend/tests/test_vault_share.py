import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now
import hashlib
import os

from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, EvidenceAttachment, AuditShareLink
from backend.api.auth import get_db, get_password_hash

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_vault.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # Create users
        session.add(Reviewer(email="admin@test.com", hashed_password=get_password_hash("pass"), role=Role.ADMIN))
        session.add(Reviewer(email="reviewer@test.com", hashed_password=get_password_hash("pass"), role=Role.REVIEWER))
        
        # Create case
        session.add(ReconciliationCase(
            case_id="case_vault_test",
            exception_code="AMOUNT_MISMATCH",
            severity="CRITICAL",
            expected_paisa=500000,
            actual_paisa=450000,
            delta_paisa=50000,
            confidence_score=0.95,
            explanation="Test vault case",
            suggested_action="ESCALATE_TO_ADMIN",
            opened_at=utc_now()
        ))
        session.commit()
        
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_generate_share_link_admin_only(client):
    # 1. Login as Reviewer -> expect 403 on generate
    res_rev = client.post("/auth/login", data={"username": "reviewer@test.com", "password": "pass"})
    token_rev = res_rev.json()["access_token"]
    
    res_gen_fail = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test", "expiry_hours": 24},
        headers={"Authorization": f"Bearer {token_rev}", "X-CSRF-Protection": "1"}
    )
    assert res_gen_fail.status_code == 403
    
    # 2. Login as Admin -> expect 200 on generate
    res_admin = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    token_admin = res_admin.json()["access_token"]
    
    res_gen = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test", "expiry_hours": 48},
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    assert res_gen.status_code == 200
    data = res_gen.json()
    assert "token" in data
    assert "otp" in data
    assert len(data["otp"]) == 6
    assert data["otp"].isdigit()
    assert data["share_url"].startswith("/vault/access/")

def test_verify_vault_otp_and_dossier_flow(client):
    # 1. Admin generates link
    res_admin = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    token_admin = res_admin.json()["access_token"]
    
    res_gen = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test", "expiry_hours": 24},
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    gen_data = res_gen.json()
    share_token = gen_data["token"]
    correct_otp = gen_data["otp"]
    
    # 2. Verify invalid token
    res_invalid_tok = client.post("/api/vault/share/verify", json={"token": "invalid_random_token", "otp": "123456"})
    assert res_invalid_tok.status_code == 404
    
    # 3. Verify wrong OTP -> expect 401 and attempt count
    res_wrong_otp = client.post("/api/vault/share/verify", json={"token": share_token, "otp": "000000"})
    assert res_wrong_otp.status_code == 401
    assert "2 attempt(s) remaining" in res_wrong_otp.json()["detail"]
    
    # 4. Verify correct OTP -> expect 200 and vault session token
    res_verify = client.post("/api/vault/share/verify", json={"token": share_token, "otp": correct_otp})
    assert res_verify.status_code == 200
    vault_token = res_verify.json()["vault_token"]
    
    # 5. Fetch dossier with vault token
    res_dossier = client.get("/api/vault/share/dossier", headers={"Authorization": f"Bearer {vault_token}"})
    assert res_dossier.status_code == 200
    dossier = res_dossier.json()
    assert dossier["case"]["case_id"] == "case_vault_test"
    assert dossier["case"]["delta_paisa"] == 50000
    assert "file_manifest" in dossier
    assert "vault_metadata" in dossier

def test_brute_force_lockout_after_3_failed_attempts(client):
    # 1. Generate link
    res_admin = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    token_admin = res_admin.json()["access_token"]
    res_gen = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test", "expiry_hours": 24},
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    gen_data = res_gen.json()
    share_token = gen_data["token"]
    correct_otp = gen_data["otp"]
    
    # 2. Attempt 1 wrong
    r1 = client.post("/api/vault/share/verify", json={"token": share_token, "otp": "111111"})
    assert r1.status_code == 401
    
    # 3. Attempt 2 wrong
    r2 = client.post("/api/vault/share/verify", json={"token": share_token, "otp": "222222"})
    assert r2.status_code == 401
    
    # 4. Attempt 3 wrong -> triggers 429 lockout
    r3 = client.post("/api/vault/share/verify", json={"token": share_token, "otp": "333333"})
    assert r3.status_code == 429
    assert "permanently locked" in r3.json()["detail"]
    
    # 5. Attempt with correct OTP now fails with 429 permanently
    r4 = client.post("/api/vault/share/verify", json={"token": share_token, "otp": correct_otp})
    assert r4.status_code == 429
    assert "permanently locked" in r4.json()["detail"]

def test_vault_download_raw_evidence_with_sha256(client, engine, tmp_path):
    # 1. Attach sample evidence file
    file_bytes = b"SAMPLE BANK RECON EVIDENCE DATA FOR AUDITOR"
    sha = hashlib.sha256(file_bytes).hexdigest()
    sample_file = tmp_path / "bank_stmt.bai2"
    sample_file.write_bytes(file_bytes)
    
    att_id = None
    with Session(engine) as session:
        att = EvidenceAttachment(
            case_id="case_vault_test",
            filename="bank_stmt.bai2",
            file_type="BAI2",
            file_size_bytes=len(file_bytes),
            file_sha256=sha,
            storage_path=str(sample_file),
            uploaded_by="reviewer@test.com",
            submitter_role="MAKER",
            is_committed=True
        )
        session.add(att)
        session.commit()
        session.refresh(att)
        att_id = att.id
        
    # 2. Generate and verify link
    res_admin = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    token_admin = res_admin.json()["access_token"]
    res_gen = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test"},
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    gen_data = res_gen.json()
    res_verify = client.post("/api/vault/share/verify", json={"token": gen_data["token"], "otp": gen_data["otp"]})
    vault_token = res_verify.json()["vault_token"]
    
    # 3. Download raw file
    res_down = client.get(f"/api/vault/share/download/{att_id}", headers={"Authorization": f"Bearer {vault_token}"})
    assert res_down.status_code == 200
    assert res_down.content == file_bytes
    assert 'filename="bank_stmt.bai2"' in res_down.headers.get("Content-Disposition", "")

def test_admin_revoke_share_link(client):
    # 1. Generate link
    res_admin = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    token_admin = res_admin.json()["access_token"]
    res_gen = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test"},
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    gen_data = res_gen.json()
    share_id = gen_data["share_id"]
    share_token = gen_data["token"]
    
    # 2. Admin revokes link
    res_revoke = client.post(
        f"/api/vault/share/revoke/{share_id}",
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    assert res_revoke.status_code == 200
    
    # 3. Auditor verify attempt fails with 404
    res_verify = client.post("/api/vault/share/verify", json={"token": share_token, "otp": gen_data["otp"]})
    assert res_verify.status_code == 404
    assert "revoked" in res_verify.json()["detail"]


def test_otp_hash_is_bcrypt_derived(client, engine):
    """
    Security check for Item 6: Asserts that the 6-digit OTP is hashed using
    slow-hash bcrypt (not fast-hash SHA-256) to prevent offline brute-force attacks
    over the 10^6 numeric keyspace if the database is compromised.
    """
    from backend.data.schema import AuditShareLink
    from backend.api.auth import pwd_context

    res_admin = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    token_admin = res_admin.json()["access_token"]
    res_gen = client.post(
        "/api/vault/share/generate",
        json={"case_id": "case_vault_test", "expiry_hours": 12},
        headers={"Authorization": f"Bearer {token_admin}", "X-CSRF-Protection": "1"}
    )
    assert res_gen.status_code == 200
    gen_data = res_gen.json()
    share_id = gen_data["share_id"]
    raw_otp = gen_data["otp"]

    with Session(engine) as session:
        link = session.exec(select(AuditShareLink).where(AuditShareLink.share_id == share_id)).first()
        assert link is not None

        # 1. Assert hash starts with bcrypt signature
        assert link.otp_hash.startswith("$2b$") or link.otp_hash.startswith("$2a$")

        # 2. Assert passlib identifies scheme as bcrypt
        assert pwd_context.identify(link.otp_hash) == "bcrypt"

        # 3. Assert constant-time verification succeeds with salted raw OTP
        assert pwd_context.verify(f"{raw_otp}:{share_id}", link.otp_hash) is True
        assert pwd_context.verify(f"999999:{share_id}", link.otp_hash) is False


