import json
import time
from fastapi import APIRouter, Depends, Request, HTTPException
from backend.api.middleware.webhook_verify import verify_razorpay_signature
from backend.api.auth import get_db
from sqlmodel import Session, select
from backend.data.schema import ProcessedWebhook
from datetime import datetime

router = APIRouter()

@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    raw_body: bytes = Depends(verify_razorpay_signature),
    session: Session = Depends(get_db)
):
    """
    Ingests events from Razorpay. Signature is already verified by dependency.
    """
    payload = json.loads(raw_body)
    event_id = payload.get("id")  # In Razorpay, the root event ID is 'id' (not under 'event' string, wait, the root has an 'id' and 'created_at')
    created_at = payload.get("created_at")
    
    if not event_id or not created_at:
        raise HTTPException(status_code=400, detail="Missing required webhook payload fields")
        
    # Check freshness (5 minute tolerance)
    current_time = time.time()
    if current_time - created_at > 300:
        raise HTTPException(status_code=400, detail="Webhook is older than 5 minute tolerance window")
        
    # Check idempotency
    existing = session.exec(select(ProcessedWebhook).where(ProcessedWebhook.event_id == event_id)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Webhook event already processed")
        
    # Mark as processed
    session.add(ProcessedWebhook(event_id=event_id, processed_at=datetime.utcnow()))
    session.commit()
    
    event_type = payload.get("event")
    
    return {"status": "ok", "event_received": event_type}
