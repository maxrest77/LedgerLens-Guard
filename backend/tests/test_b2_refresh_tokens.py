import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from backend.api.main import app
from backend.data.schema import Reviewer, Role, RefreshToken
from backend.api.auth import get_db

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_b2.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    def get_db_override():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_db] = get_db_override
    
    from backend.api.auth import get_password_hash
    with Session(engine) as session:
        session.add(Reviewer(email="user@test.com", hashed_password=get_password_hash("password"), role=Role.REVIEWER))
        session.commit()
        
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_b2_refresh_and_logout(client, engine):
    # 1. Login
    res = client.post("/auth/login", data={"username": "user@test.com", "password": "password"})
    assert res.status_code == 200
    
    cookies = client.cookies
    assert "session_token" in cookies
    assert "refresh_token" in cookies
    
    # 2. Refresh Token
    res2 = client.post("/auth/refresh", headers={"X-CSRF-Protection": "1"})
    assert res2.status_code == 200
    assert "access_token" in res2.json()
    
    # 3. Logout
    res3 = client.post("/auth/logout", headers={"X-CSRF-Protection": "1"})
    assert res3.status_code == 200
    
    # Verify cookies deleted
    # TestClient doesn't automatically drop cookies that are set to expire in the past
    # but we can check the db
    with Session(engine) as session:
        from sqlmodel import select
        rt = session.exec(select(RefreshToken)).first()
        assert rt.revoked is True
        
    # 4. Refresh should now fail
    res4 = client.post("/auth/refresh", headers={"X-CSRF-Protection": "1"})
    assert res4.status_code == 401
