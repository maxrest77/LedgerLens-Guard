import pytest
from datetime import datetime, timedelta
from sqlmodel import Session, create_engine, SQLModel
from backend.data.schema import Payment, Settlement, SettlementPaymentLink, PaymentMethod, PaymentStatus
from backend.engine.nowcasting import predict_settlement_delay

def test_f4_nowcasting(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/test_f4.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        # Create historical late settlements for UPI
        for i in range(5):
            captured = datetime.utcnow() - timedelta(days=10)
            settled = captured + timedelta(days=4) # 4 days late
            
            p = Payment(payment_id=f"p_hist_{i}", order_id="x", merchant_id="m", amount_paisa=100, payment_method=PaymentMethod.UPI, status=PaymentStatus.CAPTURED, captured_at=captured, originating_ip="ip", customer_id="c", bank_code="HDFC")
            s = Settlement(settlement_id=f"s_hist_{i}", utr="u", gross_paisa=100, fee_paisa=0, tax_paisa=0, net_paisa=100, settled_at=settled)
            link = SettlementPaymentLink(settlement_id=s.settlement_id, payment_id=p.payment_id)
            
            session.add(p)
            session.add(s)
            session.add(link)
            
        # Create a historical ON-TIME settlement for CREDIT_CARD
        captured_cc = datetime.utcnow() - timedelta(days=5)
        settled_cc = captured_cc + timedelta(days=1)
        p_cc = Payment(payment_id="p_hist_cc", order_id="x", merchant_id="m", amount_paisa=100, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=captured_cc, originating_ip="ip", customer_id="c", bank_code="HDFC")
        s_cc = Settlement(settlement_id="s_hist_cc", utr="u", gross_paisa=100, fee_paisa=0, tax_paisa=0, net_paisa=100, settled_at=settled_cc)
        link_cc = SettlementPaymentLink(settlement_id=s_cc.settlement_id, payment_id=p_cc.payment_id)
        
        session.add(p_cc)
        session.add(s_cc)
        session.add(link_cc)
        
        session.commit()
        
        # Now predict for a new UPI payment
        new_upi = Payment(payment_id="p_new_upi", order_id="x", merchant_id="m", amount_paisa=100, payment_method=PaymentMethod.UPI, status=PaymentStatus.CAPTURED, captured_at=datetime.utcnow(), originating_ip="ip", customer_id="c", bank_code="HDFC")
        
        forecast = predict_settlement_delay(new_upi, session)
        assert forecast["forecast_available"] is True
        assert forecast["probability_late"] == 1.0
        assert forecast["expected_delay_days"] == 4.0
        assert "FORECAST: 100.0% probability of being late" in forecast["message"]
        
        # Predict for new CC payment
        new_cc = Payment(payment_id="p_new_cc", order_id="x", merchant_id="m", amount_paisa=100, payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED, captured_at=datetime.utcnow(), originating_ip="ip", customer_id="c", bank_code="HDFC")
        forecast_cc = predict_settlement_delay(new_cc, session)
        assert forecast_cc["forecast_available"] is True
        assert forecast_cc["probability_late"] == 0.0
        assert "Likely to settle on time (100.0% confidence)" in forecast_cc["message"]
