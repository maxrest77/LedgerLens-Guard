import pytest
from backend.engine.fee_table import calculate_fee_paisa, calculate_tax_paisa
from backend.data.schema import PaymentMethod

# Fixtures based on VelocePay standard 2% MDR for Domestic Credit Cards + 18% GST
# with half-up integer rounding at the paise level.
VELOCEPAY_FIXTURES = [
    # (gross_paisa, expected_fee_paisa, expected_tax_paisa)
    # Example 1: Exact integer boundary
    # 100.00 INR (10000 paise). 2% MDR = 200 paise. 18% GST = 36 paise.
    (10000, 200, 36),
    
    # Example 2: Round down on fee, round down on tax
    # 153.85 INR (15385 paise). 2% MDR = 307.7 -> 308. 18% GST = 55.44 -> 55.
    (15385, 308, 55),
    
    # Example 3: Round up on fee, round down on tax
    # 77.77 INR (7777 paise). 2% MDR = 155.54 -> 156. 18% GST = 28.08 -> 28.
    (7777, 156, 28),
    
    # Example 4: Exact integer fee, round up on tax
    # 45.50 INR (4550 paise). 2% MDR = 91 paise. 18% GST = 16.38 -> 16.
    (4550, 91, 16),
    
    # Example 5: High value, exact round up boundary on tax
    # 2999.00 INR (299900 paise). 2% MDR = 5998 paise. 18% GST = 1079.64 -> 1080.
    (299900, 5998, 1080),
    
    # Example 6: Half-up exactly on .5
    # 1112.25 INR (111225 paise). 2% MDR = 2224.5 -> 2225. 18% GST = 400.5 -> 401.
    (111225, 2225, 401)
]

@pytest.mark.parametrize("gross_paisa, expected_fee, expected_tax", VELOCEPAY_FIXTURES)
def test_velocepay_rounding_exact(gross_paisa, expected_fee, expected_tax):
    """
    Validates integer arithmetic rounding exactly matches published/observed
    VelocePay MDR (2%) and GST (18%) half-up rounding logic at the paise level.
    """
    # Credit Card defaults to 200 bps (2%) in calculate_fee_paisa when no session is passed
    computed_fee = calculate_fee_paisa(PaymentMethod.CREDIT_CARD, gross_paisa)
    computed_tax = calculate_tax_paisa(computed_fee)
    
    assert computed_fee == expected_fee, f"MDR failed for {gross_paisa}p: got {computed_fee}, expected {expected_fee}"
    assert computed_tax == expected_tax, f"GST failed for {gross_paisa}p: got {computed_tax}, expected {expected_tax}"

def test_round_half_up_edge_cases():
    from backend.engine.fee_table import round_half_up
    # Test strict .5 boundary rounding up
    assert round_half_up(150, 100) == 2  # 1.5 -> 2
    assert round_half_up(250, 100) == 3  # 2.5 -> 3
    # Test just below .5 rounding down
    assert round_half_up(149, 100) == 1  # 1.49 -> 1
    # Test just above .5 rounding up
    assert round_half_up(151, 100) == 2  # 1.51 -> 2
