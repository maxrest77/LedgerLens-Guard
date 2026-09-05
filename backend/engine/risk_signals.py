import math
from datetime import datetime, timedelta
from typing import List, Dict, Any
from backend.data.schema import Payment, Refund, PaymentMethod

def compute_z_score(value: float, history: List[float]) -> float:
    if not history:
        return 0.0
    mean = sum(history) / len(history)
    variance = sum((x - mean) ** 2 for x in history) / len(history)
    std_dev = math.sqrt(variance)
    if std_dev == 0:
        return 0.0 if value <= mean else float('inf')
    return (value - mean) / std_dev

def get_velocity_z_score(payments: List[Payment], target_date: datetime) -> float:
    start_history = target_date - timedelta(days=14)
    historical_counts = {}
    target_count = 0
    
    for p in payments:
        if start_history <= p.captured_at < target_date:
            date_key = p.captured_at.date()
            historical_counts[date_key] = historical_counts.get(date_key, 0) + 1
        elif p.captured_at.date() == target_date.date():
            target_count += 1
            
    history = []
    curr = start_history.date()
    while curr < target_date.date():
        history.append(historical_counts.get(curr, 0))
        curr += timedelta(days=1)
        
    return compute_z_score(target_count, history)

def get_ip_clustering_z_score(payments: List[Payment], target_date: datetime) -> float:
    start_history = target_date - timedelta(days=14)
    counts_by_day = {}
    
    for p in payments:
        if p.payment_method in (PaymentMethod.CREDIT_CARD, PaymentMethod.DEBIT_CARD):
            # No crypto decrypt needed for pure z-score of origin counts
            ip = p.originating_ip
            
            if start_history <= p.captured_at < target_date:
                d = p.captured_at.date()
                if d not in counts_by_day:
                    counts_by_day[d] = {}
                counts_by_day[d][ip] = counts_by_day[d].get(ip, 0) + 1
            elif p.captured_at.date() == target_date.date():
                d = target_date.date()
                if d not in counts_by_day:
                    counts_by_day[d] = {}
                counts_by_day[d][ip] = counts_by_day[d].get(ip, 0) + 1

    history = []
    curr = start_history.date()
    while curr < target_date.date():
        if curr in counts_by_day and counts_by_day[curr]:
            history.append(max(counts_by_day[curr].values()))
        else:
            history.append(0)
        curr += timedelta(days=1)
        
    target_max = 0
    if target_date.date() in counts_by_day and counts_by_day[target_date.date()]:
        target_max = max(counts_by_day[target_date.date()].values())
        
    return compute_z_score(target_max, history)

def get_refund_anomaly_z_score(payments: List[Payment], refunds: List[Refund], target_date: datetime) -> float:
    start_history = target_date - timedelta(days=14)
    p_vol = {}
    r_vol = {}
    
    for p in payments:
        if start_history <= p.captured_at <= target_date:
            d = p.captured_at.date()
            p_vol[d] = p_vol.get(d, 0) + p.amount_paisa
            
    for r in refunds:
        if start_history.date() <= r.processed_at.date() <= target_date.date():
            d = r.processed_at.date()
            r_vol[d] = r_vol.get(d, 0) + r.amount_paisa
            
    history = []
    curr = start_history.date()
    while curr < target_date.date():
        pv = p_vol.get(curr, 0)
        rv = r_vol.get(curr, 0)
        ratio = (rv / pv) if pv > 0 else (1.0 if rv > 0 else 0.0)
        history.append(ratio)
        curr += timedelta(days=1)
        
    target_pv = p_vol.get(target_date.date(), 0)
    target_rv = r_vol.get(target_date.date(), 0)
    target_ratio = (target_rv / target_pv) if target_pv > 0 else (1.0 if target_rv > 0 else 0.0)
    
    return compute_z_score(target_ratio, history)

def evaluate_merchant_risk(payments: List[Payment], refunds: List[Refund], target_date: datetime) -> Dict[str, Any]:
    """
    Evaluates statistical risk signals based on a 14-day trailing baseline.
    Requires at least 2 independent signals > 2.5 z-score to trigger a flag.
    """
    velocity_z = get_velocity_z_score(payments, target_date)
    ip_z = get_ip_clustering_z_score(payments, target_date)
    refund_z = get_refund_anomaly_z_score(payments, refunds, target_date)
    
    anomalies = []
    if velocity_z > 2.5: anomalies.append("VELOCITY_SPIKE")
    if ip_z > 2.5: anomalies.append("IP_CLUSTERING")
    if refund_z > 2.5: anomalies.append("REFUND_ANOMALY")
    
    # We leave the old interface names available if strictly needed by dummy dashboards, but return dicts
    return {
        "flagged": len(anomalies) >= 2,
        "signals": anomalies,
        "z_scores": {
            "velocity": velocity_z,
            "ip": ip_z,
            "refund": refund_z
        }
    }

# Backward compatibility stubs if old imports expect them (unused but preserved)
def detect_velocity_spike(payments: List[Payment], target_date: datetime) -> bool:
    return get_velocity_z_score(payments, target_date) > 2.5

def detect_refund_anomaly(payments: List[Payment], refunds: List[Refund], target_date: datetime) -> bool:
    return get_refund_anomaly_z_score(payments, refunds, target_date) > 2.5

def detect_ip_clustering(payments: List[Payment], target_date: datetime) -> List[str]:
    # old signature expected a list of IPs. We don't maintain this natively anymore.
    return ["127.0.0.1"] if get_ip_clustering_z_score(payments, target_date) > 2.5 else []
