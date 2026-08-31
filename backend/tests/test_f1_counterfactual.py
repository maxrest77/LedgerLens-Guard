from backend.engine.explanation_engine import generate_explanation

def test_f1_counterfactual_positive_delta():
    context = {
        "settlement_id": "set_1",
        "utr": "UTR123",
        "payment_count": 1,
        "expected_net": 10000,
        "actual_credit": 9764,
        "delta": 236, # expected - actual > 0 means shortfall
        "fee": 200,
        "tax": 36,
    }
    explanation = generate_explanation("BANK_CREDIT_SHORTFALL", context)
    assert "[Counterfactual: If the bank credit were \u20b92.36 higher, this would be a clean match.]" in explanation

def test_f1_counterfactual_negative_delta():
    context = {
        "settlement_id": "set_2",
        "utr": "UTR124",
        "payment_count": 1,
        "expected_net": 10000,
        "actual_credit": 10200,
        "delta": -200, # expected - actual < 0 means excess
        "fee": 200,
        "tax": 36,
    }
    explanation = generate_explanation("BANK_CREDIT_EXCESS", context)
    assert "[Counterfactual: If the bank credit were \u20b92.00 lower, this would be a clean match.]" in explanation
