import pytest
from datetime import datetime, timedelta
from backend.data.schema import Payment, Refund, PaymentMethod, PaymentStatus
from backend.engine.risk_signals import evaluate_merchant_risk, compute_z_score

def test_risk_signals_adaptive_baseline():
    """
    Construct a scenario that trips the old fixed threshold (e.g. volume > 3x average, or IP count > 5)
    but does NOT trip the new adaptive threshold because it only has ONE signal, not TWO.
    """
    target = datetime(2026, 1, 15, 12, 0, 0)
    payments = []
    
    # 1. High volume baseline (mean=10, std=1)
    for i in range(14):
        d = target - timedelta(days=14-i)
        for j in range(10):
            payments.append(Payment(
                payment_id=f"p_{i}_{j}",
                order_id="o", merchant_id="m1", amount_paisa=1000,
                payment_method=PaymentMethod.UPI, status=PaymentStatus.CAPTURED,
                captured_at=d, originating_ip="1.1.1.1", customer_id="c1", bank_code="b1"
            ))
            
    # Target day: 40 payments. (4x average!) This would trip the old >3.0x logic.
    for j in range(40):
        payments.append(Payment(
            payment_id=f"p_t_{j}",
            order_id="o", merchant_id="m1", amount_paisa=1000,
            payment_method=PaymentMethod.UPI, status=PaymentStatus.CAPTURED,
            captured_at=target, originating_ip="1.1.1.1", customer_id="c1", bank_code="b1"
        ))
        
    # No refunds.
    refunds = []
    
    res = evaluate_merchant_risk(payments, refunds, target)
    # Even though velocity is highly anomalous (>2.5 z-score), it's the ONLY signal.
    # Therefore, flagged should be False!
    assert "VELOCITY_SPIKE" in res["signals"]
    assert "REFUND_ANOMALY" not in res["signals"]
    assert res["flagged"] is False

def test_risk_signals_co_occurrence():
    """
    Construct a scenario with two co-occurring signals and confirm it DOES flag.
    """
    target = datetime(2026, 1, 15, 12, 0, 0)
    payments = []
    refunds = []
    
    # Baseline: 10 txns per day, 0 refunds.
    for i in range(14):
        d = target - timedelta(days=14-i)
        for j in range(10):
            payments.append(Payment(
                payment_id=f"p_{i}_{j}", order_id="o", merchant_id="m1", amount_paisa=1000,
                payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED,
                captured_at=d, originating_ip=f"ip_{j}", customer_id="c1", bank_code="b1"
            ))
            
    # Target day: 40 txns, 30 from the SAME IP! (Both velocity and IP clustering spike)
    for j in range(40):
        ip = "bad_ip" if j < 30 else f"ip_{j}"
        payments.append(Payment(
            payment_id=f"p_t_{j}", order_id="o", merchant_id="m1", amount_paisa=1000,
            payment_method=PaymentMethod.CREDIT_CARD, status=PaymentStatus.CAPTURED,
            captured_at=target, originating_ip=ip, customer_id="c1", bank_code="b1"
        ))
        
    res = evaluate_merchant_risk(payments, refunds, target)
    
    assert "VELOCITY_SPIKE" in res["signals"]
    assert "IP_CLUSTERING" in res["signals"]
    assert res["flagged"] is True
