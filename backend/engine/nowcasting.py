from sqlmodel import Session, select
from datetime import datetime
from backend.data.schema import Payment, Settlement, SettlementPaymentLink

def predict_settlement_delay(payment: Payment, session: Session) -> dict:
    """
    Settlement Nowcasting: 
    Predicts the probability of a settlement being late or short based on historical
    latency patterns for the same payment method and bank code.
    
    Returns a probabilistic forecast (e.g., 85% likely to be late by 2 days).
    This is purely a forecast and does not mutate deterministic state.
    """
    # Grab historical settlements for this payment method
    # Since we can't do complex joins easily in this mock, we'll fetch linked payments
    # and check their captured_at vs settled_at
    historical_links = session.exec(
        select(Settlement, Payment)
        .join(SettlementPaymentLink, Settlement.settlement_id == SettlementPaymentLink.settlement_id)
        .join(Payment, Payment.payment_id == SettlementPaymentLink.payment_id)
        .where(Payment.payment_method == payment.payment_method)
        .limit(100)
    ).all()
    
    if not historical_links:
        return {
            "forecast_available": False,
            "message": "Insufficient historical data for nowcasting."
        }
        
    late_count = 0
    total_delay_days = 0
    total_count = len(historical_links)
    
    for stl, pmt in historical_links:
        delay = (stl.settled_at - pmt.captured_at).days
        if delay > 2: # Consider >2 days as late
            late_count += 1
            total_delay_days += delay
            
    late_probability = late_count / total_count
    
    if late_count > 0:
        expected_delay = total_delay_days / late_count
    else:
        expected_delay = 0.0
        
    return {
        "forecast_available": True,
        "probability_late": late_probability,
        "expected_delay_days": expected_delay,
        "historical_sample_size": total_count,
        "message": f"FORECAST: {late_probability:.1%} probability of being late. Expected delay: {expected_delay:.1f} days." if late_probability > 0.5 else f"FORECAST: Likely to settle on time ({1 - late_probability:.1%} confidence)."
    }
