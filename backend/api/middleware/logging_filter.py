import logging
import re
from backend.engine.sanitizer import mask_pan_luhn

class PIIRedactionFilter(logging.Filter):
    """
    Redacts recognizable UTR patterns, email addresses, and credit card PANs from log records.
    """
    EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    UTR_REGEX = re.compile(r'\bUTR[A-Za-z0-9_-]*\b', re.IGNORECASE)

    def filter(self, record):
        if isinstance(record.msg, str):
            record.msg = self._redact(record.msg)
        
        # Also redact any string arguments
        if isinstance(record.args, tuple):
            record.args = tuple(self._redact(arg) if isinstance(arg, str) else arg for arg in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: (self._redact(v) if isinstance(v, str) else v) for k, v in record.args.items()}
            
        return True

    def _redact(self, text: str) -> str:
        text = self.EMAIL_REGEX.sub("[EMAIL_REDACTED]", text)
        text = self.UTR_REGEX.sub("[UTR_REDACTED]", text)
        text = mask_pan_luhn(text)
        return text

def apply_pii_redaction():
    pii_filter = PIIRedactionFilter()
    
    # Apply to uvicorn access logger
    uvicorn_logger = logging.getLogger("uvicorn.access")
    uvicorn_logger.addFilter(pii_filter)
    
    # Apply to root logger and any other specific loggers
    logging.getLogger().addFilter(pii_filter)
    logging.getLogger("uvicorn").addFilter(pii_filter)
    logging.getLogger("fastapi").addFilter(pii_filter)
