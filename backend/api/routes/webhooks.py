import json
import time
import os
import hmac
import hashlib
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from backend.api.middleware.webhook_verify import verify_velocepay_signature
from backend.api.auth import get_db
from sqlmodel import Session, select
from backend.data.schema import ProcessedWebhook
from datetime import datetime
from backend.utils.time_utils import utc_now

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
        
    session.add(ProcessedWebhook(event_id=event_id, processed_at=utc_now()))
    session.commit()

@router.post("/velocepay")
@router.post("/rayzorpay")
@router.post("/razorpay")
async def velocepay_webhook(
    request: Request,
    raw_body: bytes = Depends(verify_velocepay_signature),
    session: Session = Depends(get_db)
):
    payload = json.loads(raw_body)
    _check_idempotency_and_freshness(session, payload.get("id"), payload.get("created_at"))
    return {"status": "ok", "event_received": payload.get("event"), "psp": "VELOCEPAY"}

# Aliases for backward compatibility
rayzorpay_webhook = velocepay_webhook
razorpay_webhook = velocepay_webhook

@router.post("/stratapay")
@router.post("/stripay")
@router.post("/stripe")
async def stratapay_webhook(
    request: Request,
    session: Session = Depends(get_db)
):
    sig = request.headers.get("StrataPay-Signature") or request.headers.get("Stripay-Signature") or request.headers.get("Stripe-Signature")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing StrataPay-Signature header")
    raw_body = await request.body()
    payload = json.loads(raw_body)
    _check_idempotency_and_freshness(session, payload.get("id"), payload.get("created_at"))
    return {"status": "ok", "event_received": payload.get("type"), "psp": "STRATAPAY"}

stripay_webhook = stratapay_webhook
stripe_webhook = stratapay_webhook

@router.post("/prismpay")
@router.post("/payultra")
@router.post("/payu")
async def prismpay_webhook(
    request: Request,
    session: Session = Depends(get_db)
):
    raw_body = await request.body()
    payload = json.loads(raw_body)
    
    prismpay_secret = os.getenv("PRISMPAY_WEBHOOK_SECRET") or os.getenv("PAYULTRA_WEBHOOK_SECRET") or os.getenv("PAYU_WEBHOOK_SECRET")
    received_sig = request.headers.get("X-PrismPay-Signature") or request.headers.get("X-PayUltra-Signature") or request.headers.get("X-PayU-Signature")
    if prismpay_secret:
        if not received_sig:
            raise HTTPException(status_code=400, detail="Missing X-PrismPay-Signature header")
        expected_sig = hmac.new(prismpay_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, received_sig):
            raise HTTPException(status_code=400, detail="Invalid PrismPay webhook signature")

    _check_idempotency_and_freshness(session, payload.get("id"), payload.get("created_at"))
    return {"status": "ok", "event_received": payload.get("event"), "psp": "PRISMPAY"}

payultra_webhook = prismpay_webhook
payu_webhook = prismpay_webhook
