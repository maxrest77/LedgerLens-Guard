import pytest
from backend.data.schema import PaymentMethod
from backend.engine.fee_table import calculate_fee_paisa, calculate_tax_paisa

def test_upi_rupay_zero_fee():
    assert calculate_fee_paisa(PaymentMethod.UPI, 500000) == 0
    assert calculate_fee_paisa(PaymentMethod.RUPAY_DEBIT, 15000) == 0

def test_net_banking_fee_with_cap():
    # 1.5% of 50,000 = 750 (under 1500 cap)
    assert calculate_fee_paisa(PaymentMethod.NET_BANKING, 50000) == 750
    # 1.5% of 200,000 = 3000 (exceeds 1500 cap, so should return 1500)
    assert calculate_fee_paisa(PaymentMethod.NET_BANKING, 200000) == 1500

def test_credit_card_fee():
    # 2.0% of 150,000 = 3000
    assert calculate_fee_paisa(PaymentMethod.CREDIT_CARD, 150000) == 3000

def test_debit_card_tiered_fee():
    # < 2,000 (200,000 paise): 0.4%
    assert calculate_fee_paisa(PaymentMethod.DEBIT_CARD, 199999) == 800
    # >= 2,000 (200,000 paise): 0.9%
    assert calculate_fee_paisa(PaymentMethod.DEBIT_CARD, 200000) == 1800

def test_international_fee():
    # 3.0% of 100,000 = 3000
    assert calculate_fee_paisa(PaymentMethod.INTERNATIONAL, 100000) == 3000

def test_calculate_tax_paisa():
    # 18% of 100 is 18
    assert calculate_tax_paisa(100) == 18
    # 18% of 105 is 18.9 -> 19 (rounded half up)
    assert calculate_tax_paisa(105) == 19
    # 18% of 1500 = 270
    assert calculate_tax_paisa(1500) == 270
