import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from backend.api.main import app
from backend.data.schema import Reviewer, Role, ReconciliationCase, CaseStatus
from backend.api.auth import get_db, get_password_hash
from datetime import datetime

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_f7.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    
    with Session(engine) as session:
        # Create users
        session.add(Reviewer(email="rev1@test.com", hashed_password=get_password_hash("password"), role=Role.REVIEWER))
        session.add(Reviewer(email="rev2@test.com", hashed_password=get_password_hash("password"), role=Role.REVIEWER))
        session.add(Reviewer(email="senior@test.com", hashed_password=get_password_hash("password"), role=Role.SENIOR_APPROVER))
        
        # Create critical case
        session.add(ReconciliationCase(
            case_id="case_crit_1",
            exception_code="M01",
            severity="CRITICAL",
            expected_paisa=100,
            actual_paisa=0,
            delta_paisa=100,
            confidence_score=0.9,
            explanation="test",
            suggested_action="test",
            opened_at=datetime.utcnow()
        ))
        session.commit()
        
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_maker_checker(client, engine):
    # 1. Login as reviewer 1
    res1 = client.post("/auth/login", data={"username": "rev1@test.com", "password": "password"})
    token1 = res1.json()["access_token"]
    
    # 2. Try to approve critical case
    res2 = client.post(
        "/api/exceptions/case_crit_1/review",
        json={"action": "APPROVE", "reason": "this is a very good reason over 20 chars"},
        headers={"Authorization": f"Bearer {token1}", "X-CSRF-Protection": "1"}
    )
    assert res2.status_code == 200
    assert res2.json()["case"]["status"] == CaseStatus.PENDING_CO_REVIEW.value
    
    # 3. Same reviewer tries again
    res3 = client.post(
        "/api/exceptions/case_crit_1/review",
        json={"action": "APPROVE", "reason": "this is a very good reason over 20 chars"},
        headers={"Authorization": f"Bearer {token1}", "X-CSRF-Protection": "1"}
    )
    assert res3.status_code == 403
    assert "distinct identity" in res3.json()["detail"]
    
    # 4. Another regular reviewer tries (should fail because needs SENIOR_APPROVER)
    res_login2 = client.post("/auth/login", data={"username": "rev2@test.com", "password": "password"})
    token2 = res_login2.json()["access_token"]
    
    res4 = client.post(
        "/api/exceptions/case_crit_1/review",
        json={"action": "APPROVE", "reason": "this is a very good reason over 20 chars"},
        headers={"Authorization": f"Bearer {token2}", "X-CSRF-Protection": "1"}
    )
    assert res4.status_code == 403
    assert "Senior Approver or Admin" in res4.json()["detail"]
    
    # 5. Senior approver approves
    res_login3 = client.post("/auth/login", data={"username": "senior@test.com", "password": "password"})
    token3 = res_login3.json()["access_token"]
    
    res5 = client.post(
        "/api/exceptions/case_crit_1/review",
        json={"action": "APPROVE", "reason": "this is a very good reason over 20 chars"},
        headers={"Authorization": f"Bearer {token3}", "X-CSRF-Protection": "1"}
    )
    assert res5.status_code == 200
    assert res5.json()["case"]["status"] == CaseStatus.APPROVED.value
    assert res5.json()["case"]["co_reviewer_email"] == "senior@test.com"
    assert res5.json()["case"]["resolved_by"] == "rev1@test.com"
    
    # Verify audit blocks (should be 2)
    with Session(engine) as session:
        from backend.audit.chain import AuditBlock
        blocks = session.exec(select(AuditBlock).where(AuditBlock.case_id == "case_crit_1")).all()
        assert len(blocks) == 2
        assert blocks[0].reviewer == "rev1@test.com"
        assert blocks[1].reviewer == "senior@test.com"
