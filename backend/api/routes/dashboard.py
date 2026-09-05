from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase, CaseStatus, Payment
from backend.audit.chain import AuditBlock
import json
import os

router = APIRouter()

# Resolve metrics path relative to THIS file -> api/routes/dashboard.py -> backend/data/
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_METRICS_PATH = os.path.join(_BACKEND_DIR, "data", "last_batch_metrics.json")

@router.get("/dashboard")
async def get_dashboard_metrics(session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"]))):
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
    
    # Dynamic risk signals from merchant risk engine
    from backend.data.schema import Refund
    from backend.engine.risk_signals import evaluate_merchant_risk
    from datetime import datetime
    
    payments = session.exec(select(Payment)).all()
    refunds = session.exec(select(Refund)).all()
    
    from backend.utils.time_utils import utc_now
    risk_signals = []
    if payments:
        max_date = max((p.captured_at for p in payments), default=utc_now())
        try:
            eval_res = evaluate_merchant_risk(payments, refunds, max_date)
            z = eval_res.get("z_scores", {})
            vel_z = z.get("velocity", 0.0)
            ip_z = z.get("ip", 0.0)
            ref_z = z.get("refund", 0.0)
            
            if vel_z > 2.0:
                risk_signals.append({
                    "type": "Velocity Spike Monitor",
                    "severity": "HIGH" if vel_z > 2.5 else "MEDIUM",
                    "active": True,
                    "detail": f"Payment volume is elevated (+{vel_z:.1f} sigma standard deviations over 14-day baseline).",
                    "date": max_date.isoformat()
                })
            if ip_z > 2.0:
                risk_signals.append({
                    "type": "IP Clustering Monitor",
                    "severity": "HIGH" if ip_z > 2.5 else "MEDIUM",
                    "active": True,
                    "detail": f"Elevated single-IP transaction clustering (+{ip_z:.1f} sigma deviation).",
                    "date": max_date.isoformat()
                })
            if ref_z > 2.0:
                risk_signals.append({
                    "type": "Refund Anomaly Monitor",
                    "severity": "HIGH" if ref_z > 2.5 else "MEDIUM",
                    "active": True,
                    "detail": f"Refund-to-payment ratio exceeds standard variance (+{ref_z:.1f} sigma deviation).",
                    "date": max_date.isoformat()
                })
        except Exception as err:
            pass
            
    if not risk_signals:
        risk_signals.append({
            "type": "Statistical Anomaly Monitor",
            "severity": "INFO",
            "active": False,
            "detail": "All transaction velocity, IP, and refund metrics remain within standard baseline.",
            "date": utc_now().isoformat()
        })
    
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
        "risk_signals": risk_signals,
        "chart_data": chart_data
    }
