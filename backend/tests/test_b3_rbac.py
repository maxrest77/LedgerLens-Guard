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
        # Create users with different roles: ADMIN and REVIEWER
        session.add(Reviewer(email="admin@test.com", hashed_password=pwd_context.hash("pass"), role=Role.ADMIN))
        session.add(Reviewer(email="reviewer@test.com", hashed_password=pwd_context.hash("pass"), role=Role.REVIEWER))
        session.commit()
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session
    
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_b3_rbac_enforcement(client, session):
    # 1. Login as ADMIN
    res = client.post("/auth/login", data={"username": "admin@test.com", "password": "pass"})
    admin_token = res.json()["access_token"]
    client.cookies.clear()
    
    # 2. Login as REVIEWER
    res = client.post("/auth/login", data={"username": "reviewer@test.com", "password": "pass"})
    reviewer_token = res.json()["access_token"]
    client.cookies.clear()
    
    # 3. Read routes accessible to both (e.g. /api/dashboard)
    res = client.get("/api/dashboard", headers={"Authorization": f"Bearer {reviewer_token}"})
    assert res.status_code in [200, 404]
    client.cookies.clear()

    res = client.get("/api/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code in [200, 404]
    client.cookies.clear()
    
    # 4. Admin-only route (/api/admin/exposure)
    # REVIEWER should be rejected with 403
    res_rev_admin = client.get(
        "/api/admin/exposure",
        headers={"Authorization": f"Bearer {reviewer_token}"}
    )
    assert res_rev_admin.status_code == 403
    assert "not permitted" in res_rev_admin.json()["detail"]
    client.cookies.clear()
    
    # ADMIN should be allowed (status 200)
    res_adm_admin = client.get(
        "/api/admin/exposure",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_adm_admin.status_code == 200
