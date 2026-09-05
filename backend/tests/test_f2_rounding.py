import pytest
from backend.engine.fee_table import calculate_fee_paisa, calculate_tax_paisa, round_half_up
from backend.data.schema import PaymentMethod

def test_f2_velocepay_rounding_exact_match():
    # Test our rounding utility
    assert round_half_up(150, 100) == 2
    assert round_half_up(149, 100) == 1
    
    # Real VelocePay Example
    # Transaction: ₹ 1,999.00 -> 199900 paise
    # Debit card fee (under 2000 is 0.4%) => 0.4% of 199900 = 799.6 paise
    # VelocePay should round to 800 paise
    fee = calculate_fee_paisa(PaymentMethod.DEBIT_CARD, 199900)
    assert fee == 800
    
    # GST = 18% of 800 = 144 paise
    tax = calculate_tax_paisa(fee)
    assert tax == 144
    
    # Another example where tax requires rounding
    # Fee = 803 paise
    # 18% of 803 = 144.54 -> rounds to 145 paise
    assert calculate_tax_paisa(803) == 145
