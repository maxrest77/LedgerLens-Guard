from backend.data.schema import PaymentMethod

def calculate_fee_paisa(method: PaymentMethod, gross_paisa: int) -> int:
    """
    Returns fee in paise. Integer arithmetic only — no floats.
    All percentage rates are expressed as integer basis points / 10000.
    """
    if method in (PaymentMethod.UPI, PaymentMethod.RUPAY_DEBIT):
        return 0  # 0% (RBI mandate)
    
    elif method == PaymentMethod.NET_BANKING:
        flat = 1500  # ₹15 flat
        pct = (gross_paisa * 150) // 10000  # 1.5%
        return min(flat, pct)
        
    elif method == PaymentMethod.CREDIT_CARD:
        return (gross_paisa * 200) // 10000  # 2.0%
        
    elif method == PaymentMethod.DEBIT_CARD:
        if gross_paisa < 200_000:  # < ₹2,000
            return (gross_paisa * 40) // 10000  # 0.4%
        else:
            return (gross_paisa * 90) // 10000  # 0.9%
            
    elif method == PaymentMethod.INTERNATIONAL:
        return (gross_paisa * 300) // 10000  # 3.0%
        
    elif method == PaymentMethod.EMI:
        return (gross_paisa * 200) // 10000  # 2.0% (simplified)
        
    return 0

def calculate_tax_paisa(fee_paisa: int) -> int:
    """GST = 18% of fee. Integer arithmetic only."""
    return (fee_paisa * 18) // 100
