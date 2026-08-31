from datetime import datetime, timedelta
from typing import List, Dict
from backend.data.schema import Payment, Refund

def detect_velocity_spike(payments: List[Payment], target_date: datetime) -> bool:
    """
    Detects if the volume on target_date is 300% above the 7-day moving average.
    """
    start_history = target_date - timedelta(days=7)
    
    historical_counts = {}
    target_count = 0
    
    for p in payments:
        if start_history <= p.captured_at < target_date:
            date_key = p.captured_at.date()
            historical_counts[date_key] = historical_counts.get(date_key, 0) + 1
        elif p.captured_at.date() == target_date.date():
            target_count += 1
            
    if not historical_counts:
        return False
        
    avg = sum(historical_counts.values()) / len(historical_counts)
    if avg == 0:
        return False
        
    return target_count > (avg * 3.0)

def detect_refund_anomaly(payments: List[Payment], refunds: List[Refund], target_date: datetime) -> bool:
    """
    Detects if refund volume exceeds 20% of captured volume on a given day.
    """
    payment_vol = sum(p.amount_paisa for p in payments if p.captured_at.date() == target_date.date())
    refund_vol = sum(r.amount_paisa for r in refunds if r.processed_at.date() == target_date.date())
    
    if payment_vol == 0:
        return refund_vol > 0
        
    return (refund_vol / payment_vol) > 0.20

def detect_ip_clustering(payments: List[Payment], target_date: datetime) -> List[str]:
    """
    Returns a list of IPs that have > 5 transactions in a single day.
    """
    ip_counts = {}
    for p in payments:
        if p.captured_at.date() == target_date.date():
            if p.payment_method in (PaymentMethod.CREDIT_CARD, PaymentMethod.DEBIT_CARD):
                from backend.utils.crypto import decrypt_pii
                ip = decrypt_pii(p.originating_ip)
                ip_counts[ip] = ip_counts.get(ip, 0) + 1
            
    return [ip for ip, count in ip_counts.items() if count > 5]
