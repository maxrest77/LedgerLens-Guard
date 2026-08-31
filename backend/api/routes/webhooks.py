import json
from fastapi import APIRouter, Depends, Request
from backend.api.middleware.webhook_verify import verify_razorpay_signature
from backend.api.auth import get_db
from sqlmodel import Session

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
    
    # In a real app, this would use an idempotency key (e.g., event ID)
    # and write to a buffer/queue for the normaliser/reconciler.
    # For now, we accept it as verified and return 200 OK.
    event = payload.get("event")
    
    return {"status": "ok", "event_received": event}
