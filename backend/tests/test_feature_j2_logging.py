import logging
import pytest
from fastapi.testclient import TestClient
from backend.api.main import app

def test_pii_redacted_from_logs(caplog):
    # caplog.set_level needs to be applied, and we must ensure the filter is attached to it
    # But caplog uses its own handler. We must manually apply the filter to the caplog handler
    # so we test the filter logic itself as applied to standard emitted records.
    from backend.api.middleware.logging_filter import PIIRedactionFilter
    
    # Fastapi TestClient doesn't actually trigger uvicorn.access logs because it bypasses uvicorn.
    # So we'll emit a manual log to uvicorn.access simulating what uvicorn does,
    # OR we apply the filter to caplog's handler to verify the filter works on emission.
    caplog.handler.addFilter(PIIRedactionFilter())
    caplog.set_level(logging.INFO)
    
    logger = logging.getLogger("uvicorn.access")
    
    # Simulate uvicorn access log
    raw_email = "test.user_123@example.com"
    raw_utr = "UTR8989898989"
    
    logger.info(f'127.0.0.1:5000 - "GET /api/exceptions/search?email={raw_email}&utr={raw_utr} HTTP/1.1" 200')
    
    # Check emitted logs
    assert len(caplog.records) > 0
    record = caplog.records[0]
    
    assert raw_email not in record.message
    assert raw_utr not in record.message
    assert "[EMAIL_REDACTED]" in record.message
    assert "[UTR_REDACTED]" in record.message
    
    # Test args reduction
    logger.info('User %s requested %s', raw_email, raw_utr)
    record2 = caplog.records[1]
    assert raw_email not in record2.message
    assert raw_utr not in record2.message
    assert "[EMAIL_REDACTED]" in record2.message
    assert "[UTR_REDACTED]" in record2.message
