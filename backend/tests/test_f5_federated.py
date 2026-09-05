import pytest
import time
import json
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel, select
from backend.api.main import app
from backend.api.auth import get_db
from backend.data.schema import ProcessedWebhook

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test_f5.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

@pytest.fixture(name="client")
def client_fixture(engine):
    app.dependency_overrides[get_db] = lambda: Session(engine)
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

def test_f5_federated_webhooks(client, engine):
    now = int(time.time())
    
    # 1. StrataPay Webhook
    stratapay_payload = {
        "id": "evt_stratapay_1",
        "created_at": now,
        "type": "charge.succeeded"
    }
    res_stratapay = client.post(
        "/webhooks/stratapay", 
        content=json.dumps(stratapay_payload),
        headers={"StrataPay-Signature": "t=123,v1=abc"}
    )
    assert res_stratapay.status_code == 200
    assert res_stratapay.json()["psp"] == "STRATAPAY"
    
    # Replay StrataPay (should fail G1 idempotency)
    res_stratapay_replay = client.post(
        "/webhooks/stratapay", 
        content=json.dumps(stratapay_payload),
        headers={"StrataPay-Signature": "t=123,v1=abc"}
    )
    assert res_stratapay_replay.status_code == 409
    
    # 2. PrismPay Webhook
    prismpay_payload = {
        "id": "evt_prismpay_1",
        "created_at": now,
        "event": "transaction.success"
    }
    res_prismpay = client.post(
        "/webhooks/prismpay", 
        content=json.dumps(prismpay_payload)
    )
    assert res_prismpay.status_code == 200
    assert res_prismpay.json()["psp"] == "PRISMPAY"
    
    # Check DB
    with Session(engine) as session:
        events = session.exec(select(ProcessedWebhook)).all()
        event_ids = [e.event_id for e in events]
        assert "evt_stratapay_1" in event_ids
        assert "evt_prismpay_1" in event_ids


def test_prismpay_signature_verification(client, engine):
    import os
    import hmac
    import hashlib
    os.environ["PRISMPAY_WEBHOOK_SECRET"] = "prismpay_secret_key"
    try:
        now = int(time.time())
        payload = json.dumps({"id": "evt_prismpay_signed", "created_at": now, "event": "transaction.success"}).encode("utf-8")
        
        # 1. Missing signature header -> 400
        res_no_sig = client.post("/webhooks/prismpay", content=payload)
        assert res_no_sig.status_code == 400
        assert "Missing X-PrismPay-Signature" in res_no_sig.json()["detail"]
        
        # 2. Invalid signature -> 400
        res_bad_sig = client.post("/webhooks/prismpay", content=payload, headers={"X-PrismPay-Signature": "invalid_sig"})
        assert res_bad_sig.status_code == 400
        assert "Invalid PrismPay webhook signature" in res_bad_sig.json()["detail"]
        
        # 3. Valid HMAC signature -> 200
        valid_sig = hmac.new("prismpay_secret_key".encode("utf-8"), payload, hashlib.sha256).hexdigest()
        res_valid = client.post("/webhooks/prismpay", content=payload, headers={"X-PrismPay-Signature": valid_sig})
        assert res_valid.status_code == 200
        assert res_valid.json()["psp"] == "PRISMPAY"
    finally:
        os.environ.pop("PRISMPAY_WEBHOOK_SECRET", None)
