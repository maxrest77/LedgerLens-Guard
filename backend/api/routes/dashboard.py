from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase, CaseStatus, PaymentMethod, Payment
from backend.audit.chain import AuditBlock
import json
import os

router = APIRouter()

# Resolve metrics path relative to THIS file -> api/routes/dashboard.py -> backend/data/
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_METRICS_PATH = os.path.join(_BACKEND_DIR, "data", "last_batch_metrics.json")

@router.get("/dashboard")
async def get_dashboard_metrics(session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["REVIEWER", "SENIOR_APPROVER", "AUDITOR", "ADMIN"]))):
    cases = session.exec(select(ReconciliationCase)).all()
    
    from collections import Counter
    
    total_cases = len(cases)
    open_cases = len([c for c in cases if c.status == CaseStatus.OPEN])
    auto_resolved = len([c for c in cases if c.status == CaseStatus.AUTO_RESOLVED])
    
    # Read real metrics from batch run if available
    try:
        with open(_METRICS_PATH, "r") as f:
            batch_metrics = json.load(f)
            health_rate = batch_metrics.get("match_rate", 0.0)
            throughput_str = f"{batch_metrics['throughput']} records/sec - {batch_metrics['duration_ms']:.0f}ms batch time"
    except Exception:
        # Fallback: calculate from cases table
        total_payments = len(session.exec(select(Payment)).all())
        health_rate = round(((total_payments - total_cases) / total_payments * 100) if total_payments > 0 else 100.0, 1)
        throughput_str = "Run batch to calculate throughput"
    
    expected_net = sum(c.expected_paisa for c in cases)
    unresolved_delta = sum(c.delta_paisa for c in cases if c.status == CaseStatus.OPEN)
    
    code_counts = Counter(c.exception_code for c in cases)
    chart_data = [{"code": k, "count": v} for k, v in code_counts.items()]
    
    # Recent activity
    recent_blocks = session.exec(select(AuditBlock).order_by(AuditBlock.index.desc()).limit(5)).all()
    
    return {
        "kpis": {
            "health_rate": health_rate,
            "expected_net_paisa": expected_net,
            "unresolved_delta_paisa": unresolved_delta,
            "throughput": throughput_str,
            "total_cases": total_cases,
            "open_cases": open_cases,
            "auto_resolved": auto_resolved
        },
        "recent_activity": [
            {
                "case_id": b.case_id,
                "action": b.action,
                "reviewer": b.reviewer,
                "timestamp": b.timestamp
            } for b in recent_blocks
        ],
        "risk_signals": [
            {
                "type": "Velocity Spike Monitor",
                "severity": "HIGH",
                "active": True,
                "detail": "Payment volume is 300% above 7-day average.",
                "date": "2024-08-08T12:00:00"
            }
        ],
        "chart_data": chart_data
    }
