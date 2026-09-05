from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now
from backend.data.schema import Payment, Refund, Settlement, BankEntry, Adjustment, PaymentMethod, PaymentStatus
from backend.engine.exception_classifier import classify_exceptions

def setup_mocks(monkeypatch, mock_fee=20, mock_tax=4):
    monkeypatch.setattr("backend.engine.exception_classifier.calculate_fee_paisa", lambda p, a, d, s: mock_fee)
    monkeypatch.setattr("backend.engine.exception_classifier.calculate_tax_paisa", lambda f: mock_tax)

def test_clean_baseline(monkeypatch):
    setup_mocks(monkeypatch, 20, 4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=4, net_paisa=976, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=976, value_date=utc_now().date())
    
    exceptions = classify_exceptions(settlement, bank, [payment], [], [], session=None)
    assert len(exceptions) == 0

def test_missing_settlement(monkeypatch):
    setup_mocks(monkeypatch)
    # Payment older than 3 days, no settlement
    captured = utc_now() - timedelta(days=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=captured, merchant_id="m1", order_id="o1")
    
    exceptions = classify_exceptions(None, None, [payment], [], [], session=None)
    assert len(exceptions) == 1
    assert exceptions[0].code == "MISSING_SETTLEMENT"

def test_fee_rate_mismatch(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    # fee_paisa is 30 instead of 20
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=30, tax_paisa=4, net_paisa=966, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=966, value_date=utc_now().date())
    
    exceptions = classify_exceptions(settlement, bank, [payment], [], [], session=None)
    codes = [e.code for e in exceptions]
    assert "FEE_RATE_MISMATCH" in codes
    assert len(codes) == 1

def test_tax_mismatch(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    # tax_paisa is 5 instead of 4
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=5, net_paisa=975, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=975, value_date=utc_now().date())
    
    exceptions = classify_exceptions(settlement, bank, [payment], [], [], session=None)
    codes = [e.code for e in exceptions]
    assert "TAX_MISMATCH" in codes
    assert len(codes) == 1

def test_settlement_on_hold(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=4, net_paisa=976, settled_at=utc_now(), merchant_id="m1", on_hold=True)
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=976, value_date=utc_now().date())
    
    exceptions = classify_exceptions(settlement, bank, [payment], [], [], session=None)
    codes = [e.code for e in exceptions]
    assert "SETTLEMENT_ON_HOLD" in codes
    assert len(codes) == 1

def test_missing_bank_credit(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=4, net_paisa=976, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    
    exceptions = classify_exceptions(settlement, None, [payment], [], [], session=None)
    codes = [e.code for e in exceptions]
    assert "MISSING_BANK_CREDIT" in codes
    assert len(codes) == 1

def test_bank_credit_shortfall(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=4, net_paisa=976, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    # Expected net is 976, bank gives 900
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=900, value_date=utc_now().date())
    
    exceptions = classify_exceptions(settlement, bank, [payment], [], [], session=None)
    codes = [e.code for e in exceptions]
    assert "BANK_CREDIT_SHORTFALL" in codes
    assert len(codes) == 1

def test_bank_credit_excess(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=4, net_paisa=976, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    # Expected net is 976, bank gives 1000
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=1000, value_date=utc_now().date())
    
    exceptions = classify_exceptions(settlement, bank, [payment], [], [], session=None)
    codes = [e.code for e in exceptions]
    assert "BANK_CREDIT_EXCESS" in codes
    assert len(codes) == 1

def test_refund_mdr_unrecoverable_and_partial(monkeypatch):
    # This tests both REFUND_MDR_UNRECOVERABLE and PARTIAL_REFUND_LEDGER_GAP 
    # Wait, the prompt says: "Each test's fixture must be engineered to trigger exactly that one code and no other."
    pass

def test_refund_mdr_unrecoverable(monkeypatch):
    setup_mocks(monkeypatch, mock_fee=20, mock_tax=4)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=20, tax_paisa=4, net_paisa=976, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=976, value_date=utc_now().date())
    
    # Full refund to avoid PARTIAL_REFUND_LEDGER_GAP
    refund = Refund(refund_id="r1", payment_id="p1", amount_paisa=1000, created_at=utc_now(), merchant_id="m1")
    
    exceptions = classify_exceptions(settlement, bank, [payment], [refund], [], session=None)
    codes = [e.code for e in exceptions]
    assert "REFUND_MDR_UNRECOVERABLE" in codes
    assert len(codes) == 1

def test_partial_refund_ledger_gap(monkeypatch):
    # We want ONLY PARTIAL_REFUND_LEDGER_GAP, so fee should be 0 to avoid REFUND_MDR_UNRECOVERABLE
    setup_mocks(monkeypatch, mock_fee=0, mock_tax=0)
    payment = Payment(payment_id="p1", amount_paisa=1000, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=utc_now(), merchant_id="m1", order_id="o1")
    settlement = Settlement(settlement_id="s1", utr="UTR1", amount_paisa=1000, fee_paisa=0, tax_paisa=0, net_paisa=1000, settled_at=utc_now(), merchant_id="m1", on_hold=False)
    bank = BankEntry(entry_id="b1", utr="UTR1", amount_paisa=1000, value_date=utc_now().date())
    
    # Partial refund
    refund = Refund(refund_id="r1", payment_id="p1", amount_paisa=500, created_at=utc_now(), merchant_id="m1")
    
    exceptions = classify_exceptions(settlement, bank, [payment], [refund], [], session=None)
    codes = [e.code for e in exceptions]
    assert "PARTIAL_REFUND_LEDGER_GAP" in codes
    assert len(codes) == 1
