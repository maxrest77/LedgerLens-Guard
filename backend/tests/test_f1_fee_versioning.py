import pytest
from datetime import datetime, timedelta
from sqlmodel import Session, create_engine, SQLModel
from backend.data.schema import FeeRule, PaymentMethod
from backend.engine.fee_table import calculate_fee_paisa

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_f1.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

def test_f1_fee_versioning_historical_lookup(engine):
    with Session(engine) as session:
        # Old rule: 2.0%
        r1 = FeeRule(
            method=PaymentMethod.CREDIT_CARD,
            effective_from=datetime(2025, 1, 1),
            effective_to=datetime(2025, 12, 31, 23, 59, 59),
            pct_basis_points=200
        )
        # New rule: 2.5%
        r2 = FeeRule(
            method=PaymentMethod.CREDIT_CARD,
            effective_from=datetime(2026, 1, 1),
            effective_to=None,
            pct_basis_points=250
        )
        session.add(r1)
        session.add(r2)
        session.commit()
        
        # Test transaction in 2025
        dt_2025 = datetime(2025, 6, 1)
        fee_2025 = calculate_fee_paisa(PaymentMethod.CREDIT_CARD, 100000, dt_2025, session)
        assert fee_2025 == 2000  # 2.0% of 1000
        
        # Test transaction in 2026
        dt_2026 = datetime(2026, 6, 1)
        fee_2026 = calculate_fee_paisa(PaymentMethod.CREDIT_CARD, 100000, dt_2026, session)
        assert fee_2026 == 2500  # 2.5% of 1000
