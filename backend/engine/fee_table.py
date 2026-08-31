from datetime import datetime
from backend.data.schema import PaymentMethod

def calculate_fee_paisa(method: PaymentMethod, gross_paisa: int, transaction_date: datetime = None, session = None) -> int:
    """
    Returns fee in paise. Integer arithmetic only — no floats.
    Fetches the versioned rule from the database if session is provided.
    Falls back to hardcoded defaults for generator scripts.
    """
    pct_bp = None
    flat_cap = None
    threshold = None
    pct_below = None
    
    if session and transaction_date:
        from sqlmodel import select
        from backend.data.schema import FeeRule
        rule = session.exec(
            select(FeeRule)
            .where(FeeRule.method == method)
            .where(FeeRule.effective_from <= transaction_date)
            .order_by(FeeRule.effective_from.desc())
            .limit(1)
        ).first()
        
        # Verify if rule is active (effective_to is None or in the future)
        if rule and (rule.effective_to is None or rule.effective_to >= transaction_date):
            pct_bp = rule.pct_basis_points
            flat_cap = rule.flat_cap_paisa
            threshold = rule.threshold_paisa
            pct_below = rule.pct_below_threshold
            
    # Fallback to defaults
    if pct_bp is None:
        if method in (PaymentMethod.UPI, PaymentMethod.RUPAY_DEBIT):
            return 0
        elif method == PaymentMethod.NET_BANKING:
            pct_bp, flat_cap = 150, 1500
        elif method == PaymentMethod.CREDIT_CARD:
            pct_bp = 200
        elif method == PaymentMethod.DEBIT_CARD:
            pct_bp, threshold, pct_below = 90, 200000, 40
        elif method == PaymentMethod.INTERNATIONAL:
            pct_bp = 300
        elif method == PaymentMethod.EMI:
            pct_bp = 200
        else:
            return 0

    if threshold is not None and pct_below is not None:
        if gross_paisa < threshold:
            fee = round_half_up(gross_paisa * pct_below, 10000)
        else:
            fee = round_half_up(gross_paisa * pct_bp, 10000)
    else:
        fee = round_half_up(gross_paisa * pct_bp, 10000)
        
    if flat_cap is not None:
        return min(flat_cap, fee)
    return fee

def round_half_up(value_paisa: int, divisor: int) -> int:
    """
    Rounds half-up using integer arithmetic.
    e.g. 1.5 -> 2. In paise, 150/100 -> 2
    """
    return (value_paisa + (divisor // 2)) // divisor

def calculate_tax_paisa(fee_paisa: int) -> int:
    """GST = 18% of fee. Razorpay rounds half up."""
    return round_half_up(fee_paisa * 18, 100)
