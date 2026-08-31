import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from backend.api.main import app
from backend.api.auth import get_db

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_h2.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

def test_h2_rate_limiting(engine):
    def get_db_override():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_db] = get_db_override
    
    # Also reset the rate limit state
    for middleware in app.user_middleware:
        if hasattr(middleware.cls, "__name__") and middleware.cls.__name__ == "RateLimitMiddleware":
            # State is captured in the instance, but unfortunately FastAPI wraps it.
            pass
            
    # Reset globally? Wait, the RateLimitMiddleware instance holds `self.requests`
    # Let's just use a fresh client. TestClient creates the app wrapper, but the middleware instance is shared if app is shared.
    # To be safe, we'll just expect 5 requests to be allowed *since this test started*.
    client = TestClient(app)
    
    # Send 5 requests
    for _ in range(5):
        res = client.post("/auth/login", data={"username": "wrong", "password": "wrong"})
        assert res.status_code == 401 # Should hit the auth logic and fail auth, not 429
        
    # 6th request should fail
    res = client.post("/auth/login", data={"username": "wrong", "password": "wrong"})
    assert res.status_code == 429
    assert "Too many login attempts" in res.json()["detail"]
    
    app.dependency_overrides.clear()
