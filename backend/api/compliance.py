import os
import sys
import logging

logger = logging.getLogger(__name__)

# Standard India regions across AWS, GCP, Azure
VALID_INDIA_REGIONS = {
    "ap-south-1", "ap-south-2",       # AWS Mumbai, Hyderabad
    "asia-south1", "asia-south2",     # GCP Mumbai, Delhi
    "centralindia", "southindia", "jioindiawest" # Azure
}

def enforce_data_localization():
    from backend.config.settings import settings
    region = os.getenv("HOSTING_REGION", settings.HOSTING_REGION)
    
    # Bypass for local tests if explicitly allowed, but tests should simulate prod
    if not region:
        logger.critical("HOSTING_REGION is not set! RBI compliance requires explicit region pinning. Refusing to start.")
        sys.exit(1)
        
    region = region.lower().strip()
    
    if region not in VALID_INDIA_REGIONS and "india" not in region and "south" not in region:
        # Check 'south' / 'india' as a fallback for custom or new regions
        pass 
        
    if region not in VALID_INDIA_REGIONS:
        logger.critical(f"HOSTING_REGION '{region}' is not a recognized India data center. RBI payment data localization mandates storage strictly within India. Refusing to start.")
        sys.exit(1)
        
    logger.info(f"Data localization check passed: {region} is a compliant India region.")

def enforce_security_configuration():
    from backend.config.settings import validate_settings
    try:
        validate_settings()
    except RuntimeError as e:
        logger.critical(str(e))
        sys.exit(1)
    if os.getenv("ENV") == "production":
        secret = os.getenv("SECRET_KEY")
        if not secret or secret == "change_this_to_a_long_random_string_in_production":
            logger.critical("FATAL SECURITY MISCONFIGURATION: Default SECRET_KEY is not permitted in production. Refusing to start.")
            sys.exit(1)
