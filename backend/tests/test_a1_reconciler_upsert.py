import pytest
from datetime import datetime
from sqlmodel import Session, SQLModel, create_engine, select
from backend.data.schema import (
    Payment, Settlement, SettlementPaymentLink, BankEntry,
    PaymentMethod, PaymentStatus, CaseStatus, ReconciliationCase
)
from backend.audit.chain import AuditBlock
from backend.engine.reconciler import reconcile_batch

@pytest.fixture
def engine():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    return engine

def test_a1_reconciler_preserves_decision_and_recomputes_on_change(engine):
    with Session(engine) as session:
        # 1. Setup mock data
        payment_id = "pay_test1"
        settlement_id = "set_test1"
        utr = "UTR123"
        
        p = Payment(
            payment_id=payment_id, order_id="ord1", merchant_id="m1",
            amount_paisa=1000, payment_method=PaymentMethod.UPI, status=PaymentStatus.CAPTURED,
            captured_at=datetime.utcnow(), originating_ip="1.1.1.1", customer_id="c1", bank_code="b1"
        )
        s = Settlement(
            settlement_id=settlement_id, utr=utr,
            gross_paisa=1000, fee_paisa=0, tax_paisa=0, net_paisa=1000,
            settled_at=datetime.utcnow()
        )
        l = SettlementPaymentLink(settlement_id=settlement_id, payment_id=payment_id)
        # Bank credit shortfall: expected 1000, actual 200 (delta 800 > 500 auto-resolve limit)
        b = BankEntry(utr=utr, amount_paisa=200, value_date=datetime.utcnow().date(), description="", bank_reference="")
        
        session.add_all([p, s, l, b])
        session.commit()
        
        # 2. Run reconciler
        cases = reconcile_batch(session)
        assert len(cases) == 1
        case = cases[0]
        assert case.status == CaseStatus.OPEN
        case_id = case.case_id
        
        # 3. Reviewer approves the case
        case.status = CaseStatus.APPROVED
        case.resolved_at = datetime.utcnow()
        case.resolved_by = "test_reviewer"
        session.add(case)
        session.commit()
        
        # 4. Re-run reconciler with IDENTICAL inputs
        cases = reconcile_batch(session)
        assert len(cases) == 1
        case = session.get(ReconciliationCase, case_id)
        assert case is not None
        # Should preserve the decision
        assert case.status == CaseStatus.APPROVED
        assert case.resolved_by == "test_reviewer"
        
        # 5. Change underlying facts (actual amount changes to 100)
        b = session.get(BankEntry, b.id)
        b.amount_paisa = 100
        session.add(b)
        session.commit()
        
        # 6. Re-run reconciler
        cases = reconcile_batch(session)
        assert len(cases) == 1
        case = session.get(ReconciliationCase, case_id)
        assert case is not None
        # Should reopen
        assert case.status == CaseStatus.OPEN
        assert case.actual_paisa == 100
        assert case.delta_paisa == 900
        assert case.resolved_by is None
        
        # Check audit chain for CASE_RECOMPUTED
        blocks = session.exec(select(AuditBlock).where(AuditBlock.case_id == case_id)).all()
        recompute_blocks = [b for b in blocks if b.action == "CASE_RECOMPUTED"]
        assert len(recompute_blocks) == 1
        assert "Underlying financial facts changed" in recompute_blocks[0].reason
