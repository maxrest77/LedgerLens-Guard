from datetime import datetime
from typing import Dict, Any, Optional

# Simple SLA thresholds configurable by administrators
SLA_THRESHOLDS_HOURS = {
    "CRITICAL": 24,   # 24 hours
    "HIGH": 72,       # 3 days
    "MEDIUM": 168,    # 7 days
    "LOW": 336        # 14 days
}

def get_sla_info(severity: Optional[str], opened_at: Optional[datetime], now: Optional[datetime] = None) -> Dict[str, Any]:
    if now is None:
        from backend.utils.time_utils import utc_now
        now = utc_now()
    
    sev_key = (severity or "MEDIUM").upper()
    sla_hours = SLA_THRESHOLDS_HOURS.get(sev_key, 168)
    
    if not opened_at:
        return {
            "status": "OK",
            "age_hours": 0.0,
            "sla_hours": sla_hours,
            "remaining_hours": float(sla_hours)
        }
        
    age_hours = round(max(0.0, (now - opened_at).total_seconds() / 3600.0), 1)
    remaining = round(sla_hours - age_hours, 1)
    
    if remaining <= 0:
        status = "BREACHED"
    elif remaining <= (sla_hours * 0.25):
        status = "DUE_SOON"
    else:
        status = "OK"
        
    return {
        "status": status,
        "age_hours": age_hours,
        "sla_hours": sla_hours,
        "remaining_hours": remaining
    }
