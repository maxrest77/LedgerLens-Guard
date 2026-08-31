from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase, Payment, Settlement, BankEntry, Adjustment, Refund, SettlementPaymentLink

router = APIRouter()

@router.get("/exceptions/{case_id}")
async def get_exception_detail(case_id: str, session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["REVIEWER", "SENIOR_APPROVER", "AUDITOR", "ADMIN"]))):
    case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == case_id)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    # Gather evidence pack (raw records)
    evidence = {}
    
    if case.settlement_id:
        settlement = session.exec(select(Settlement).where(Settlement.settlement_id == case.settlement_id)).first()
        evidence["settlement"] = settlement
        
        # Link payments
        links = session.exec(select(SettlementPaymentLink).where(SettlementPaymentLink.settlement_id == case.settlement_id)).all()
        pids = [l.payment_id for l in links]
        payments = session.exec(select(Payment).where(Payment.payment_id.in_(pids))).all() if pids else []
        evidence["payments"] = payments
        
        # Adjustments
        adjs = session.exec(select(Adjustment).where(Adjustment.settlement_id == case.settlement_id)).all()
        evidence["adjustments"] = adjs
        
    elif case.payment_id:
        p = session.exec(select(Payment).where(Payment.payment_id == case.payment_id)).first()
        evidence["payments"] = [p] if p else []
        
    if case.utr:
        b = session.exec(select(BankEntry).where(BankEntry.utr == case.utr)).first()
        evidence["bank_entry"] = b
        
    return {
        "case": case,
        "evidence": evidence
    }
