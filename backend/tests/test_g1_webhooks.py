import pytest
import time
import json
import hmac
import hashlib
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from backend.api.main import app
from backend.db.init import engine as default_engine
from backend.data.schema import ProcessedWebhook
from sqlalchemy.pool import StaticPool
import os

os.environ["VELOCEPAY_WEBHOOK_SECRET"] = "test_secret"
from backend.api.middleware.webhook_verify import SECRET

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    from backend.api.auth import get_db
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def get_signature(payload_bytes: bytes) -> str:
    return hmac.new(
        SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()

def test_g1_webhook_idempotency_and_freshness(client, session):
    now = int(time.time())
    
    # 1. Valid and fresh webhook
    payload_valid = json.dumps({"id": "evt_1", "created_at": now, "event": "payment.captured"}).encode("utf-8")
    sig_valid = get_signature(payload_valid)
    
    res1 = client.post("/webhooks/velocepay", content=payload_valid, headers={"X-VelocePay-Signature": sig_valid})
    assert res1.status_code == 200
    assert res1.json()["event_received"] == "payment.captured"
    
    # Verify it was saved
    assert session.get(ProcessedWebhook, "evt_1") is not None

    # 2. Replay same webhook (idempotency failure)
    res2 = client.post("/webhooks/velocepay", content=payload_valid, headers={"X-VelocePay-Signature": sig_valid})
    assert res2.status_code == 409
    assert "already processed" in res2.json()["detail"]
    
    # 3. Old webhook (freshness failure)
    payload_old = json.dumps({"id": "evt_2", "created_at": now - 600, "event": "payment.captured"}).encode("utf-8")
    sig_old = get_signature(payload_old)
    
    res3 = client.post("/webhooks/velocepay", content=payload_old, headers={"X-VelocePay-Signature": sig_old})
    assert res3.status_code == 400
    assert "tolerance" in res3.json()["detail"]
