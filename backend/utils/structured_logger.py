import json
import logging
import sys
from typing import Optional, Dict, Any

from backend.utils.time_utils import utc_now
from backend.api.middleware.correlation import get_correlation_id
from backend.api.middleware.logging_filter import PIIRedactionFilter

class JSONLogFormatter(logging.Formatter):
    """
    Formats log records into single-line JSON objects with standardized fields:
    timestamp, level, logger, message, correlation_id, and any extra context.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.redactor = PIIRedactionFilter()

    def format(self, record: logging.LogRecord) -> str:
        # Format the basic log message
        message = record.getMessage()
        if isinstance(message, str):
            message = self.redactor._redact(message)

        log_data: Dict[str, Any] = {
            "timestamp": utc_now().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": message,
            "correlation_id": getattr(record, "correlation_id", None) or get_correlation_id(),
        }

        # Include standard request metadata if present in record.__dict__
        for attr in ("method", "path", "status_code", "duration_ms", "client_ip", "user_id"):
            val = getattr(record, attr, None)
            if val is not None:
                log_data[attr] = val

        # Include exception info if available
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data, default=str)

def setup_logging(log_format: str = "text", log_level: int = logging.INFO) -> None:
    """
    Configures root and application loggers with either JSON or standard text formatting,
    with PII redaction guaranteed across all handlers.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers to avoid duplicates
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(log_level)

    if log_format.lower() == "json":
        stream_handler.setFormatter(JSONLogFormatter())
    else:
        text_format = "%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
        stream_handler.setFormatter(logging.Formatter(text_format))

    # Apply PII redaction filter
    stream_handler.addFilter(PIIRedactionFilter())
    root_logger.addHandler(stream_handler)

    # Also apply to uvicorn access and error loggers
    for uvicorn_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        u_logger = logging.getLogger(uvicorn_name)
        u_logger.handlers = [stream_handler]
        u_logger.propagate = False
