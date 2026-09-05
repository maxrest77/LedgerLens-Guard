import pytest
import asyncio
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from backend.api.main import app, SystemState
from backend.audit.chain import append_to_chain, AuditBlock
from backend.data.schema import Reviewer, Role
from backend.api.auth import get_db

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_e3.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    def get_db_override():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_db] = get_db_override
    
    # Reset system state
    SystemState.lockdown = False
    SystemState.tampered_index = None
    SystemState.strike_count = 0
    SystemState.locked_case_ids = set()
    
    client = TestClient(app)
    
    # Pre-seed auth
    with Session(engine) as session:
        session.add(Reviewer(email="admin@test.com", hashed_password="hash", role=Role.ADMIN))
        session.commit()
    
    yield client
    app.dependency_overrides.clear()

def test_e3_lockdown_strike_system(client, engine):
    # 1. Setup a valid chain
    with Session(engine) as session:
        append_to_chain(session, "case_1", "admin", "APPROVE", "reason", {})
        append_to_chain(session, "case_2", "admin", "APPROVE", "reason", {})
        session.commit()
    
    # 2. Corrupt block 0 (case_1)
    with Session(engine) as session:
        block = session.get(AuditBlock, 0)
        block.action = "REJECT" # Tamper!
        session.add(block)
        session.commit()
    
    # Simulate daemon strike 1
    from backend.audit.chain import verify_chain
    with Session(engine) as session:
        result = verify_chain(session)
        assert not result["valid"]
        assert result["tampered_at_index"] == 0
        
        SystemState.tampered_index = 0
        SystemState.strike_count = 1
        SystemState.locked_case_ids.add("case_1")
    
    # Verify Strike 1 behavior: case_1 writes are 403, case_2 writes are 401/403 (but not locked by daemon), system is UP
    res = client.post("/api/exceptions/case_1/review", json={})
    assert res.status_code == 403
    assert "temporarily locked" in res.json()["detail"]
    
    res2 = client.post("/api/exceptions/case_2/review", json={})
    # Should get missing auth/CSRF, not "temporarily locked" or 503
    assert res2.status_code == 403 
    assert "Missing X-CSRF-Protection" in str(res2.json())
    
    # 3. Simulate daemon strike 2
    SystemState.strike_count = 2
    SystemState.lockdown = True
    
    # Verify Strike 2 behavior: system is DOWN (503)
    res3 = client.post("/api/exceptions/case_2/review", json={})
    assert res3.status_code == 503
    assert "emergency maintenance" in res3.json()["detail"]
