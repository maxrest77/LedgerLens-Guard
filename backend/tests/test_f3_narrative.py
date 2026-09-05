from backend.engine.verified_narrative import validate_narrative_facts, generate_verified_narrative

def test_f3_verified_narrative():
    context = {
        "settlement_id": "set_123",
        "expected_net": "?100.00",
        "actual_credit": "?90.00"
    }
    deterministic = "Settlement set_123 expected ?100.00 but got ?90.00."
    
    # 1. Valid narrative
    good = generate_verified_narrative(deterministic, context)
    assert "Executive Summary:" in good
    
    # 2. Hallucinated narrative
    context["simulate_hallucination"] = True
    bad = generate_verified_narrative(deterministic, context)
    # The validator should reject "500000" and fall back to deterministic
    assert bad == deterministic
    assert "Executive Summary:" not in bad
    
    # 3. Direct validator test
    assert validate_narrative_facts("The ID is set_123.", context) is True
    assert validate_narrative_facts("The ID is set_999.", context) is False


def test_f3_adversarial_fabricated_figures_rejected():
    """
    Adversarial testing for F3 hard factual validator:
    Tests that any hallucinated/fabricated amounts, altered cents/paisa,
    or invented monetary metrics are strictly rejected by the validator.
    """
    trusted_context = {
        "settlement_id": "SET_20260904_881",
        "case_id": "CASE_MDR_9921",
        "expected_net": "₹150000.00",
        "actual_credit": "₹148500.00",
        "delta": "₹1500.00",
        "tolerance_limit": "500"
    }
    deterministic_msg = "Deterministic Case CASE_MDR_9921: expected ₹150000.00, received ₹148500.00."

    # Valid synthesis matching context
    valid_draft = "Executive review of settlement SET_20260904_881: expected ₹150000.00, received ₹148500.00 (delta ₹1500.00)."
    assert validate_narrative_facts(valid_draft, trusted_context) is True

    # Adversarial Case 1: Fabricated inflated monetary loss figure (e.g. ₹950000.00)
    adv_fabricated_loss = "The settlement SET_20260904_881 caused a catastrophic loss of ₹950000.00 to merchant."
    assert validate_narrative_facts(adv_fabricated_loss, trusted_context) is False

    # Adversarial Case 2: Subtly altered decimal/paisa figure (₹1500.50 instead of ₹1500.00)
    adv_altered_cent = "The net deviation for settlement SET_20260904_881 was calculated as 1500.50."
    assert validate_narrative_facts(adv_altered_cent, trusted_context) is False

    # Adversarial Case 3: Hallucinated phantom transaction ID (TXN_FAKE_404)
    adv_fake_txn = "Missing funds linked to foreign transaction TXN_FAKE_404 in batch SET_20260904_881."
    assert validate_narrative_facts(adv_fake_txn, trusted_context) is False

    # Adversarial Case 4: Fabricated basis-point interest rate (275 bps)
    adv_invented_rate = "Discrepancy in CASE_MDR_9921 traced to an unapproved rate hike of 275 bps."
    assert validate_narrative_facts(adv_invented_rate, trusted_context) is False

    # Adversarial Case 5: Ensure fallback to deterministic msg when generation contains fabricated fact
    context_with_fabrication = dict(trusted_context, simulate_hallucination=True)
    fallback_result = generate_verified_narrative(deterministic_msg, context_with_fabrication)
    assert fallback_result == deterministic_msg
    assert "500000" not in fallback_result

def test_f3_legitimate_figures_in_varied_formats():
    """
    Validates that legitimate context figures in diverse real-world formats
    (currency symbols, Rs. prefix, thousands separators, basis points vs percentage,
    bare integers vs .00) pass validation without false-positive rejections.
    """
    context = {
        "expected_amount": "₹1,500.00",
        "actual_amount": "Rs. 1400",
        "fee_rate": "2.75%",
        "delta": "100.00"
    }

    # 1. Currency symbol ₹ vs Rs. vs bare number
    assert validate_narrative_facts("Expected ₹1500.00 and received Rs. 1400 with delta ₹100.00", context) is True
    assert validate_narrative_facts("Expected Rs. 1500 and received 1400.00 with delta 100", context) is True

    # 2. Thousands separators vs plain digits
    assert validate_narrative_facts("Expected 1,500.00 and received 1,400 with delta 100", context) is True

    # 3. Trailing .00 vs bare integer
    assert validate_narrative_facts("Variance of 100 was observed against expected 1500", context) is True
    assert validate_narrative_facts("Variance of 100.00 was observed against expected 1500.00", context) is True

    # 4. Percentage vs Basis points (2.75% == 275 bps)
    assert validate_narrative_facts("The agreed fee rate of 2.75% corresponds to 275 bps", context) is True

    # 5. Still rejects genuine fabrication in any format
    assert validate_narrative_facts("Expected ₹1500.00 but unauthorized penalty of ₹99999 was deducted", context) is False


