from typing import List, Optional
from datetime import datetime
from backend.utils.time_utils import utc_now
from backend.data.schema import Payment, Refund, Settlement, BankEntry, Adjustment
from backend.engine.fee_table import calculate_fee_paisa, calculate_tax_paisa

class ExceptionDetection:
    def __init__(self, code: str, severity: str, expected: int, actual: int):
        self.code = code
        self.severity = severity
        self.expected = expected
        self.actual = actual
        self.delta = expected - actual

def classify_exceptions(
    settlement: Optional[Settlement],
    bank_entry: Optional[BankEntry],
    payments: List[Payment],
    refunds: List[Refund],
    adjustments: List[Adjustment],
    session = None
) -> List[ExceptionDetection]:
    """
    Classifies discrepancies between Settlement, BankEntry, and child Payments.
    """
    exceptions = []
    
    # 1. MISSING_SETTLEMENT
    if not settlement and payments:
        # Check if any payment is older than 3 days
        now = utc_now()
        for p in payments:
            if (now - p.captured_at).days > 3:
                exceptions.append(ExceptionDetection("MISSING_SETTLEMENT", "HIGH", p.amount_paisa, 0))
                break
                
    if not settlement:
        return exceptions

    # Re-calculate expected fees
    expected_gross = sum(p.amount_paisa for p in payments)
    expected_fee = sum(calculate_fee_paisa(p.payment_method, p.amount_paisa, p.captured_at, session) for p in payments)
    expected_tax = calculate_tax_paisa(expected_fee)
    
    # 2. FEE_RATE_MISMATCH
    if settlement.fee_paisa != expected_fee:
        exceptions.append(ExceptionDetection("FEE_RATE_MISMATCH", "MEDIUM", expected_fee, settlement.fee_paisa))
        
    # 3. TAX_MISMATCH
    if settlement.tax_paisa != expected_tax:
        exceptions.append(ExceptionDetection("TAX_MISMATCH", "MEDIUM", expected_tax, settlement.tax_paisa))
        
    # 4. SETTLEMENT_ON_HOLD
    if settlement.on_hold:
        exceptions.append(ExceptionDetection("SETTLEMENT_ON_HOLD", "HIGH", settlement.net_paisa, 0))
        
    # Adjustment impact: adjustments are debits (TDS, chargebacks) that reduce
    # what the merchant actually receives in the bank.
    adj_total = sum(a.amount_paisa for a in adjustments)
    expected_net = settlement.net_paisa - adj_total
    
    # Check bank entry
    if not bank_entry:
        # 5. MISSING_BANK_CREDIT
        exceptions.append(ExceptionDetection("MISSING_BANK_CREDIT", "HIGH", expected_net, 0))
    else:
        # 6. BANK_CREDIT_SHORTFALL & 7. BANK_CREDIT_EXCESS
        if bank_entry.amount_paisa < expected_net:
            exceptions.append(ExceptionDetection("BANK_CREDIT_SHORTFALL", "HIGH", expected_net, bank_entry.amount_paisa))
        elif bank_entry.amount_paisa > expected_net:
            exceptions.append(ExceptionDetection("BANK_CREDIT_EXCESS", "MEDIUM", expected_net, bank_entry.amount_paisa))
            
    # Note: DUPLICATE_UTR and REFUND_WITHOUT_PAYMENT and ADJUSTMENT_UNMATCHED
    # are handled at the global ledger level in reconciler.py
    
    # 8. REFUND_MDR_UNRECOVERABLE (Informational)
    for r in refunds:
        original_payment = next((p for p in payments if p.payment_id == r.payment_id), None)
        if original_payment:
            fee = calculate_fee_paisa(original_payment.payment_method, original_payment.amount_paisa, original_payment.captured_at, session)
            if fee > 0:
                exceptions.append(ExceptionDetection("REFUND_MDR_UNRECOVERABLE", "INFO", fee, 0))
                
        # 9. PARTIAL_REFUND_LEDGER_GAP
        if r.amount_paisa > 0 and original_payment and r.amount_paisa < original_payment.amount_paisa:
            # We flag this as a potential ledger gap exposure
            exceptions.append(ExceptionDetection("PARTIAL_REFUND_LEDGER_GAP", "HIGH", original_payment.amount_paisa, r.amount_paisa))

    return exceptions
