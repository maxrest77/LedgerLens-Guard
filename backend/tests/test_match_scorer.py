from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now
from backend.data.schema import Payment, Settlement, BankEntry, PaymentMethod, PaymentStatus
from backend.engine.match_scorer import calculate_match_confidence

def test_scorer_tier_100():
    # 1.00 Exact link + UTR matched + amount exact
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=0, tax_paisa=0, net_paisa=1000, settled_at=utc_now(), merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=1000, value_date=utc_now().date())
    
    score = calculate_match_confidence(payment, settlement, bank, 1000)
    assert score == 1.00

def test_scorer_tier_095():
    # 0.95 Exact UTR match, batch net delta = 0 paisa (payment is None)
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=0, tax_paisa=0, net_paisa=1000, settled_at=utc_now(), merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=1000, value_date=utc_now().date())
    
    score = calculate_match_confidence(None, settlement, bank, 1000)
    assert score == 0.95

def test_scorer_tier_085_edge_exactly_100():
    # 0.85 Exact UTR match, batch net delta = 100 paisa
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=0, tax_paisa=0, net_paisa=1000, settled_at=utc_now(), merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=900, value_date=utc_now().date())
    
    score = calculate_match_confidence(None, settlement, bank, 1000)
    assert score == 0.85

def test_scorer_tier_070_edge_exactly_1pct():
    # 0.70 Exact UTR match, batch net delta = 1% of expected (and > 100)
    # Expected = 20000. 1% = 200.
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=20000, fee_paisa=0, tax_paisa=0, net_paisa=20000, settled_at=utc_now(), merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=19800, value_date=utc_now().date())
    
    score = calculate_match_confidence(None, settlement, bank, 20000)
    assert score == 0.70

def test_scorer_tier_050_edge_1day_5pct():
    # 0.50 Date proximity 1 day, amount match 5%
    # Expected = 10000, 5% = 500. Delta = 500 (diff utr to bypass higher tiers)
    settled_date = utc_now()
    bank_date = (settled_date + timedelta(days=1)).date()
    
    settlement = Settlement(settlement_id="s1", utr="UTR_A", amount_paisa=10000, fee_paisa=0, tax_paisa=0, net_paisa=10000, settled_at=settled_date, merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR_B", amount_paisa=9500, value_date=bank_date)
    
    score = calculate_match_confidence(None, settlement, bank, 10000)
    assert score == 0.50

def test_scorer_tier_000_unmatched():
    # <0.50 UNMATCHED (delta > 5% or date_diff > 1 when UTR differs)
    settled_date = utc_now()
    bank_date = (settled_date + timedelta(days=2)).date() # 2 days apart
    
    settlement = Settlement(settlement_id="s1", utr="UTR_A", amount_paisa=10000, fee_paisa=0, tax_paisa=0, net_paisa=10000, settled_at=settled_date, merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR_B", amount_paisa=10000, value_date=bank_date)
    
    score = calculate_match_confidence(None, settlement, bank, 10000)
    assert score == 0.0

def test_scorer_tier_000_missing_args():
    score = calculate_match_confidence(None, None, None, 1000)
    assert score == 0.0

def test_scorer_tier_000_zero_expected():
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=0, fee_paisa=0, tax_paisa=0, net_paisa=0, settled_at=utc_now(), merchant_id="m1")
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=0, value_date=utc_now().date())
    
    score = calculate_match_confidence(None, settlement, bank, 0)
    assert score == 0.0
