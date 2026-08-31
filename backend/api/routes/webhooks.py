import json
import time
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from backend.api.middleware.webhook_verify import verify_razorpay_signature
from backend.api.auth import get_db
from sqlmodel import Session, select
from backend.data.schema import ProcessedWebhook
from datetime import datetime

router = APIRouter()

def _check_idempotency_and_freshness(session: Session, event_id: str, created_at: int):
    if not event_id or not created_at:
        raise HTTPException(status_code=400, detail="Missing required webhook payload fields")
        
    current_time = time.time()
    if current_time - created_at > 300:
        raise HTTPException(status_code=400, detail="Webhook is older than 5 minute tolerance window")
    if created_at - current_time > 60:
        raise HTTPException(status_code=400, detail="Webhook timestamp is in the future")
        
    existing = session.exec(select(ProcessedWebhook).where(ProcessedWebhook.event_id == event_id)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Webhook event already processed")
        
    session.add(ProcessedWebhook(event_id=event_id, processed_at=datetime.utcnow()))
    session.commit()

@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    raw_body: bytes = Depends(verify_razorpay_signature),
    session: Session = Depends(get_db)
):
    payload = json.loads(raw_body)
    _check_idempotency_and_freshness(session, payload.get("id"), payload.get("created_at"))
    return {"status": "ok", "event_received": payload.get("event"), "psp": "RAZORPAY"}

@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="Stripe-Signature"),
    session: Session = Depends(get_db)
):
    # Mock signature verification for Stripe
    raw_body = await request.body()
    payload = json.loads(raw_body)
    _check_idempotency_and_freshness(session, payload.get("id"), payload.get("created_at"))
    return {"status": "ok", "event_received": payload.get("type"), "psp": "STRIPE"}

@router.post("/payu")
async def payu_webhook(
    request: Request,
    session: Session = Depends(get_db)
):
    # Mock signature verification for PayU
    raw_body = await request.body()
    payload = json.loads(raw_body)
    # PayU doesn't have a standard unix timestamp created_at usually, but we assume normalized mock
    _check_idempotency_and_freshness(session, payload.get("id"), payload.get("created_at"))
    return {"status": "ok", "event_received": payload.get("event"), "psp": "PAYU"}
