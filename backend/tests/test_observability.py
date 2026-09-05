import json
import logging
import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.utils.structured_logger import JSONLogFormatter
from backend.api.middleware.correlation import get_correlation_id, set_correlation_id

@pytest.fixture
def client():
    return TestClient(app)

def test_correlation_id_auto_generated(client):
    """If client sends no correlation ID, server generates one and returns it in header."""
    response = client.get("/auth/me")
    assert "X-Correlation-ID" in response.headers
    corr_id = response.headers["X-Correlation-ID"]
    assert len(corr_id) >= 16

def test_correlation_id_propagated_from_header(client):
    """If client sends X-Correlation-ID, server preserves and echoes it."""
    custom_id = "test-corr-uuid-12345"
    response = client.get("/auth/me", headers={"X-Correlation-ID": custom_id})
    assert response.headers.get("X-Correlation-ID") == custom_id

def test_request_id_fallback(client):
    """If client sends X-Request-ID instead of X-Correlation-ID, server adopts it."""
    custom_id = "req-id-7890"
    response = client.get("/auth/me", headers={"X-Request-ID": custom_id})
    assert response.headers.get("X-Correlation-ID") == custom_id

def test_json_log_formatter_structure():
    """Verify that JSONLogFormatter outputs valid JSON with standard fields."""
    formatter = JSONLogFormatter()
    logger = logging.getLogger("test.observability")
    
    set_correlation_id("corr-test-999")
    try:
        record = logger.makeRecord(
            name="test.observability",
            level=logging.INFO,
            fn="test_observability.py",
            lno=42,
            msg="Transaction verified successfully",
            args=(),
            exc_info=None,
            extra={"path": "/api/reconciliation", "method": "GET", "status_code": 200, "duration_ms": 15.4}
        )
        # Apply extra fields
        record.path = "/api/reconciliation"
        record.method = "GET"
        record.status_code = 200
        record.duration_ms = 15.4

        output = formatter.format(record)
        parsed = json.loads(output)
        
        assert parsed["level"] == "INFO"
        assert parsed["logger"] == "test.observability"
        assert parsed["message"] == "Transaction verified successfully"
        assert parsed["correlation_id"] == "corr-test-999"
        assert parsed["path"] == "/api/reconciliation"
        assert parsed["method"] == "GET"
        assert parsed["status_code"] == 200
        assert parsed["duration_ms"] == 15.4
        assert "timestamp" in parsed
    finally:
        set_correlation_id(None)

def test_json_log_formatter_pii_redaction():
    """Verify that sensitive UTR patterns and emails are redacted in structured JSON logs."""
    formatter = JSONLogFormatter()
    logger = logging.getLogger("test.redaction")
    
    record = logger.makeRecord(
        name="test.redaction",
        level=logging.WARNING,
        fn="test_observability.py",
        lno=75,
        msg="Processing settlement for reviewer john.doe@bank.com with UTR9876543210AX",
        args=(),
        exc_info=None
    )
    output = formatter.format(record)
    parsed = json.loads(output)
    
    assert "john.doe@bank.com" not in parsed["message"]
    assert "[EMAIL_REDACTED]" in parsed["message"]
    assert "UTR9876543210AX" not in parsed["message"]
    assert "[UTR_REDACTED]" in parsed["message"]
