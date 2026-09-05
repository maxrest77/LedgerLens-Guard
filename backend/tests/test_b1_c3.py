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
        session.add(Reviewer(email="test@test.com", hashed_password=pwd_context.hash("pass"), role=Role.ADMIN))
        session.commit()
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_b1_c3_cookie_and_csrf_csp(client, session):
    # 1. Login should set httpOnly cookie
    res = client.post("/auth/login", data={"username": "test@test.com", "password": "pass"})
    assert res.status_code == 200
    
    # Check cookie
    assert "session_token" in client.cookies
    # Fastapi TestClient doesn't easily expose httpOnly flag from Response headers without parsing Set-Cookie
    set_cookie = res.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    # In dev mode (ENV != production), Secure is not set and SameSite is lax
    assert "samesite=" in set_cookie.lower()
    
    # Check CSP
    assert "Content-Security-Policy" in res.headers
    assert "default-src 'self'" in res.headers["Content-Security-Policy"]
    
    # 2. Try state-changing route WITHOUT CSRF header
    # Should get 403 Forbidden due to missing X-CSRF-Protection
    # We are already authenticated via client.cookies
    res_no_csrf = client.post("/api/exceptions/case_1/review", json={"action": "APPROVE", "reason": "this is a very long reason indeed"})
    assert res_no_csrf.status_code == 403
    assert "Missing X-CSRF-Protection header" in res_no_csrf.json()["detail"]
    
    # 3. Try WITH CSRF header
    res_with_csrf = client.post(
        "/api/exceptions/case_1/review", 
        json={"action": "APPROVE", "reason": "this is a very long reason indeed"},
        headers={"X-CSRF-Protection": "1", "Idempotency-Key": "8fbebd60-71d4-4363-8770-06f7076a168a"},
        cookies={"session_token": res.cookies.get("session_token")}
    )
    # 404 because case_1 doesn't exist, but it passed auth + CSRF
    assert res_with_csrf.status_code == 404


def test_b1_cookie_mode_omits_raw_access_token(client, session):
    """
    Asserts that when cookie transport mode is active (X-Auth-Transport: cookie),
    the login response body does NOT leak or expose the raw access token in JSON,
    and subsequent authenticated requests succeed purely through the httpOnly cookie.
    """
    client.cookies.clear()
    res = client.post(
        "/auth/login",
        data={"username": "test@test.com", "password": "pass"},
        headers={"X-Auth-Transport": "cookie"}
    )
    assert res.status_code == 200
    body = res.json()

    # 1. Assert raw access token is NOT exposed in JSON response body
    assert body.get("access_token") is None
    assert body.get("token_type") == "cookie"
    assert body.get("email") == "test@test.com"

    # 2. Assert httpOnly session_token cookie was set
    set_cookie = res.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    assert "session_token" in client.cookies

    # 3. Assert authenticated endpoint /auth/me succeeds WITHOUT any Authorization Bearer header
    me_res = client.get("/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "test@test.com"
    assert me_res.json()["role"] == "ADMIN"

