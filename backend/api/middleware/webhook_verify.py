import os
import hmac
import hashlib
from fastapi import Request, HTTPException

SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "your_razorpay_webhook_secret_here")

async def verify_razorpay_signature(request: Request) -> bytes:
    """
    Middleware / Dependency to verify the X-Razorpay-Signature.
    Reads the raw body and computes HMAC.
    """
    raw_body = await request.body()
    received_sig = request.headers.get("X-Razorpay-Signature", "")
    
    expected_sig = hmac.new(
        SECRET.encode("utf-8"), 
        raw_body, 
        hashlib.sha256
    ).hexdigest()
    
    # Constant-time comparison — prevents timing attacks
    if not hmac.compare_digest(expected_sig, received_sig):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
        
    return raw_body
