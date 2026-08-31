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
