import os
import hmac
import hashlib
from fastapi import Request, HTTPException

from backend.config.settings import settings

class _DynamicSecret(str):
    def _val(self) -> str:
        return os.getenv(
            "VELOCEPAY_WEBHOOK_SECRET",
            os.getenv("RAYZORPAY_WEBHOOK_SECRET", os.getenv("RAZORPAY_WEBHOOK_SECRET", settings.VELOCEPAY_WEBHOOK_SECRET))
        )
    def encode(self, encoding: str = "utf-8", errors: str = "strict") -> bytes:
        return self._val().encode(encoding, errors)
    def __str__(self) -> str:
        return self._val()
    def __repr__(self) -> str:
        return repr(self._val())
    def __eq__(self, other: object) -> bool:
        return self._val() == other

SECRET = _DynamicSecret()

async def verify_velocepay_signature(request: Request) -> bytes:
    """
    Middleware / Dependency to verify the X-VelocePay-Signature.
    Reads the raw body and computes HMAC.
    """
    raw_body = await request.body()
    received_sig = (
        request.headers.get("X-VelocePay-Signature")
        or request.headers.get("X-Rayzorpay-Signature")
        or request.headers.get("X-Razorpay-Signature", "")
    )
    
    expected_sig = hmac.new(
        SECRET.encode("utf-8"), 
        raw_body, 
        hashlib.sha256
    ).hexdigest()
    
    # Constant-time comparison — prevents timing attacks
    if not hmac.compare_digest(expected_sig, received_sig):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
        
    return raw_body

# Backward-compatibility aliases
verify_rayzorpay_signature = verify_velocepay_signature
verify_razorpay_signature = verify_velocepay_signature
