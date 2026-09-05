import os
import logging
from typing import Optional

logger = logging.getLogger("ledgerlens.config")

def _load_env_file(filepath: str) -> None:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip()
                        if k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

_load_env_file(".env")
_load_env_file("backend/.env")

class Settings:
    """Centralized configuration loader with dev/prod guards."""
    
    # Environment
    ENV: str = os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).lower()
    IS_PRODUCTION: bool = ENV in ("production", "prod")
    IS_TESTING: bool = os.getenv("TESTING", "false").lower() in ("true", "1", "yes")
    
    # Data Localization (RBI Compliance)
    HOSTING_REGION: str = os.getenv("HOSTING_REGION", "ap-south-1")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///backend/ledgerlens.db")
    
    # Cryptographic & Authentication Secrets
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change_this_to_a_long_random_string_in_production")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    
    # Gateway HMAC Webhook Secrets
    VELOCEPAY_WEBHOOK_SECRET: str = os.getenv(
        "VELOCEPAY_WEBHOOK_SECRET",
        os.getenv("RAYZORPAY_WEBHOOK_SECRET", os.getenv("RAZORPAY_WEBHOOK_SECRET", "your_velocepay_webhook_secret_here"))
    )
    PRISMPAY_WEBHOOK_SECRET: str = os.getenv(
        "PRISMPAY_WEBHOOK_SECRET",
        os.getenv("PAYULTRA_WEBHOOK_SECRET", os.getenv("PAYU_WEBHOOK_SECRET", "your_prismpay_webhook_secret_here"))
    )
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "100"))
    
    # Observability & Logging
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "json" if os.getenv("ENVIRONMENT") in ("production", "staging") else "text")

    # Column-level PII Encryption
    ENCRYPTION_KEY: Optional[str] = os.getenv("ENCRYPTION_KEY")

    # Sovereign AI Finance Controller (Gemini Reasoning Layer)
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

settings = Settings()

def validate_settings() -> None:
    """Validates configuration at startup and warns or halts on insecure production setups."""
    if settings.IS_PRODUCTION:
        if not settings.SECRET_KEY or settings.SECRET_KEY == "change_this_to_a_long_random_string_in_production":
            raise RuntimeError(
                "FATAL SECURITY MISCONFIGURATION: Default or empty SECRET_KEY is strictly prohibited in production! "
                "Set a secure 256-bit random key via SECRET_KEY environment variable."
            )
        if len(settings.SECRET_KEY) < 32:
            raise RuntimeError("FATAL SECURITY MISCONFIGURATION: SECRET_KEY must be at least 32 characters in production.")
        if not settings.ENCRYPTION_KEY:
            raise RuntimeError("FATAL SECURITY MISCONFIGURATION: ENCRYPTION_KEY must be configured in production to protect PII.")
    else:
        if settings.SECRET_KEY == "change_this_to_a_long_random_string_in_production" and not settings.IS_TESTING:
            logger.warning(
                "[SECURITY ADVISORY] Running with default development SECRET_KEY. "
                "Ensure a high-entropy secret is configured for production deployments."
            )
        if not settings.ENCRYPTION_KEY and not settings.IS_TESTING:
            logger.warning(
                "[SECURITY ADVISORY] ENCRYPTION_KEY not set. Using ephemeral in-memory Fernet key."
            )

