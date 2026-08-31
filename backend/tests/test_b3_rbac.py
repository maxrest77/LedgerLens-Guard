import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from backend.api.main import app
from backend.db.init import engine as default_engine
from backend.data.schema import Reviewer, Role
from passlib.context import CryptContext

from sqlalchemy.pool import StaticPool

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Create users with different roles
        session.add(Reviewer(email="auditor@test.com", hashed_password=pwd_context.hash("pass"), role=Role.AUDITOR))
        session.add(Reviewer(email="reviewer@test.com", hashed_password=pwd_context.hash("pass"), role=Role.REVIEWER))
        session.commit()
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session
    app.dependency_overrides[default_engine] = get_session_override # Not directly right, need to override get_db
    
    # Better to override get_db
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_b3_rbac_enforcement(client, session):
    # 1. Login as AUDITOR
    res = client.post("/auth/login", data={"username": "auditor@test.com", "password": "pass"})
    auditor_token = res.json()["access_token"]
    # Clear cookies so they don't bleed into subsequent requests
    client.cookies.clear()
    
    # 2. Login as REVIEWER
    res = client.post("/auth/login", data={"username": "reviewer@test.com", "password": "pass"})
    reviewer_token = res.json()["access_token"]
    client.cookies.clear()
    
    # 3. Read routes (both should succeed)
    # Using /api/dashboard
    res = client.get("/api/dashboard", headers={"Authorization": f"Bearer {auditor_token}"})
    # Might fail if dashboard has no data, but shouldn't 403
    assert res.status_code in [200, 404]
    client.cookies.clear()
    
    # 4. Write route (POST /api/exceptions/case_123/review)
    # AUDITOR should be rejected
    res_audit_write = client.post(
        "/api/exceptions/case_123/review", 
        json={"action": "APPROVE", "reason": "This is a long reason that is 20 chars long"},
        headers={"Authorization": f"Bearer {auditor_token}", "X-CSRF-Protection": "1"}
    )
    assert res_audit_write.status_code == 403
    assert "not permitted" in res_audit_write.json()["detail"]
    client.cookies.clear()
    
    # REVIEWER should be allowed (might get 404 Case Not Found, which is fine, means 403 passed)
    res_rev_write = client.post(
        "/api/exceptions/case_123/review", 
        json={"action": "APPROVE", "reason": "This is a long reason that is 20 chars long with three words"},
        headers={"Authorization": f"Bearer {reviewer_token}", "X-CSRF-Protection": "1"}
    )
    assert res_rev_write.status_code != 403
