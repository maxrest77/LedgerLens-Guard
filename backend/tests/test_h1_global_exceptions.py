from sqlmodel import Session, create_engine, SQLModel, select
from datetime import datetime, timezone
from backend.data.schema import BankEntry, Refund, Adjustment, ReconciliationCase
from backend.engine.reconciler import reconcile_batch

def test_duplicate_utr(tmp_path):
    """Isolated test engineered to trigger exclusively DUPLICATE_UTR."""
    db_file = tmp_path / "test_dup_utr.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        session.add(BankEntry(entry_id="b1", utr="DUP_UTR_001", amount_paisa=50000, value_date=datetime.now(timezone.utc).date(), description="Bank Credit 1", bank_reference="ref1"))
        session.add(BankEntry(entry_id="b2", utr="DUP_UTR_001", amount_paisa=50000, value_date=datetime.now(timezone.utc).date(), description="Bank Credit 2", bank_reference="ref2"))
        session.commit()
        
        reconcile_batch(session)
        
        cases = session.exec(select(ReconciliationCase)).all()
        assert len(cases) == 1
        assert cases[0].exception_code == "DUPLICATE_UTR"
        assert cases[0].severity == "CRITICAL"
        assert cases[0].utr == "DUP_UTR_001"

def test_refund_without_payment(tmp_path):
    """Isolated test engineered to trigger exclusively REFUND_WITHOUT_PAYMENT."""
    db_file = tmp_path / "test_refund_no_pay.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        session.add(Refund(refund_id="rf_ghost_01", payment_id="pay_nonexistent_99", amount_paisa=25000, status="PROCESSED", processed_at=datetime.now(timezone.utc)))
        session.commit()
        
        reconcile_batch(session)
        
        cases = session.exec(select(ReconciliationCase)).all()
        assert len(cases) == 1
        assert cases[0].exception_code == "REFUND_WITHOUT_PAYMENT"
        assert cases[0].severity == "CRITICAL"
        assert cases[0].payment_id == "pay_nonexistent_99"

def test_adjustment_unmatched(tmp_path):
    """Isolated test engineered to trigger exclusively ADJUSTMENT_UNMATCHED."""
    db_file = tmp_path / "test_adj_unmatched.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        session.add(Adjustment(adjustment_id="adj_ghost_01", settlement_id="set_nonexistent_88", amount_paisa=1500, type="CHARGEBACK", reason="Dispute adjustment", created_at=datetime.now(timezone.utc)))
        session.commit()
        
        reconcile_batch(session)
        
        cases = session.exec(select(ReconciliationCase)).all()
        assert len(cases) == 1
        assert cases[0].exception_code == "ADJUSTMENT_UNMATCHED"
        assert cases[0].severity == "MEDIUM"
        assert cases[0].expected_paisa == 1500
