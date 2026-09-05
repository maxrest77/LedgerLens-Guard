import pytest
from datetime import datetime, timezone
from backend.data.schema import Payment, Refund, Settlement, BankEntry, Adjustment
from backend.engine.normaliser import normalise_records, LedgerRow

def test_normalise_records_chronological_ordering():
    dt1 = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    dt2 = datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc)
    dt3 = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)
    dt4 = datetime(2026, 9, 1, 13, 0, tzinfo=timezone.utc)
    dt5 = datetime(2026, 9, 1, 14, 0, tzinfo=timezone.utc)

    # Provide records out of order
    payments = [
        Payment(payment_id="PAY_001", order_id="ORD_001", amount_paisa=50000, currency="INR",
                gateway="RAZORPAY", status="CAPTURED", method="upi", captured_at=dt2)
    ]
    refunds = [
        Refund(refund_id="REF_001", payment_id="PAY_001", amount_paisa=10000,
               status="PROCESSED", reason="Customer return", processed_at=dt4)
    ]
    settlements = [
        Settlement(settlement_id="SET_001", gateway="RAZORPAY", utr="UTR_001", gross_paisa=50000,
                   fee_paisa=1000, tax_paisa=180, net_paisa=48820, status="SETTLED", settled_at=dt5)
    ]
    bank_entries = [
        BankEntry(utr="UTR_001", bank_reference="BR_001", amount_paisa=48820,
                  credit_debit="CR", booking_date=dt1, value_date=dt1)
    ]
    adjustments = [
        Adjustment(adjustment_id="ADJ_001", settlement_id="SET_001", amount_paisa=500,
                   reason="Fee rebate", created_at=dt3)
    ]

    ledger = normalise_records(payments, refunds, settlements, bank_entries, adjustments)

    assert len(ledger) == 5
    # Verify chronological sorting: dt1 < dt2 < dt3 < dt4 < dt5
    assert ledger[0].id == "UTR_001"
    assert ledger[0].type == "BANK_ENTRY"
    assert ledger[0].amount_paisa == 48820

    assert ledger[1].id == "PAY_001"
    assert ledger[1].type == "PAYMENT"
    assert ledger[1].amount_paisa == 50000

    assert ledger[2].id == "ADJ_001"
    assert ledger[2].type == "ADJUSTMENT"
    assert ledger[2].amount_paisa == 500

    assert ledger[3].id == "REF_001"
    assert ledger[3].type == "REFUND"
    assert ledger[3].amount_paisa == -10000  # Refunds are negative

    assert ledger[4].id == "SET_001"
    assert ledger[4].type == "SETTLEMENT"
    assert ledger[4].amount_paisa == 48820
