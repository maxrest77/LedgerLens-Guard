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
    
    # 1. Stripe Webhook
    stripe_payload = {
        "id": "evt_stripe_1",
        "created_at": now,
        "type": "charge.succeeded"
    }
    res_stripe = client.post(
        "/webhooks/stripe", 
        content=json.dumps(stripe_payload),
        headers={"Stripe-Signature": "t=123,v1=abc"}
    )
    assert res_stripe.status_code == 200
    assert res_stripe.json()["psp"] == "STRIPE"
    
    # Replay Stripe (should fail G1 idempotency)
    res_stripe_replay = client.post(
        "/webhooks/stripe", 
        content=json.dumps(stripe_payload),
        headers={"Stripe-Signature": "t=123,v1=abc"}
    )
    assert res_stripe_replay.status_code == 409
    
    # 2. PayU Webhook
    payu_payload = {
        "id": "evt_payu_1",
        "created_at": now,
        "event": "transaction.success"
    }
    res_payu = client.post(
        "/webhooks/payu", 
        content=json.dumps(payu_payload)
    )
    assert res_payu.status_code == 200
    assert res_payu.json()["psp"] == "PAYU"
    
    # Check DB
    with Session(engine) as session:
        events = session.exec(select(ProcessedWebhook)).all()
        event_ids = [e.event_id for e in events]
        assert "evt_stripe_1" in event_ids
        assert "evt_payu_1" in event_ids
