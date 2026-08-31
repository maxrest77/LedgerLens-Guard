from typing import List
from backend.data.schema import Payment, Refund, Settlement, BankEntry, Adjustment
from pydantic import BaseModel

class LedgerRow(BaseModel):
    id: str
    type: str  # PAYMENT, REFUND, SETTLEMENT, BANK_ENTRY, ADJUSTMENT
    amount_paisa: int
    date: str
    reference: str

def normalise_records(
    payments: List[Payment], 
    refunds: List[Refund], 
    settlements: List[Settlement], 
    bank_entries: List[BankEntry],
    adjustments: List[Adjustment]
) -> List[LedgerRow]:
    
    ledger = []
    
    for p in payments:
        ledger.append(LedgerRow(
            id=p.payment_id, type="PAYMENT", amount_paisa=p.amount_paisa,
            date=p.captured_at.isoformat(), reference=p.order_id
        ))
        
    for r in refunds:
        ledger.append(LedgerRow(
            id=r.refund_id, type="REFUND", amount_paisa=-r.amount_paisa,
            date=r.processed_at.isoformat(), reference=r.payment_id
        ))
        
    for s in settlements:
        ledger.append(LedgerRow(
            id=s.settlement_id, type="SETTLEMENT", amount_paisa=s.net_paisa,
            date=s.settled_at.isoformat(), reference=s.utr
        ))
        
    for b in bank_entries:
        ledger.append(LedgerRow(
            id=b.utr, type="BANK_ENTRY", amount_paisa=b.amount_paisa,
            date=b.value_date.isoformat(), reference=b.bank_reference
        ))
        
    for a in adjustments:
        ledger.append(LedgerRow(
            id=a.adjustment_id, type="ADJUSTMENT", amount_paisa=a.amount_paisa,
            date=a.created_at.isoformat(), reference=a.settlement_id
        ))
        
    # Sort chronologically
    ledger.sort(key=lambda x: x.date)
    return ledger
