"""
Rule-based explanation engine.
One template per exception code, populated with pre-computed facts.
No AI/LLM — fully deterministic and auditable.
"""

EXPLANATION_TEMPLATES = {
    "SYSTEMATIC_FEE_DEVIATION": (
        "Systematic deviation detected across {batch_count} settlements. "
        "Total expected: {expected_net}. Total actual: {actual_credit}. Total delta: {delta}. "
        "Suggested action: {suggested_action}."
    ),
    "BANK_CREDIT_SHORTFALL": (
        "Settlement {settlement_id} (UTR: {utr}) batched {payment_count} payments "
        "with an expected net of {expected_net}. The bank statement shows a credit "
        "of {actual_credit} — a shortfall of {delta}. "
        "Fee: {fee}. GST: {tax}. "
        "Suggested action: {suggested_action}."
    ),
    "BANK_CREDIT_EXCESS": (
        "Settlement {settlement_id} (UTR: {utr}) batched {payment_count} payments "
        "with an expected net of {expected_net}. The bank statement shows a credit "
        "of {actual_credit} — an excess of {delta}. "
        "Suggested action: {suggested_action}."
    ),
    "MISSING_BANK_CREDIT": (
        "Settlement {settlement_id} (UTR: {utr}) for {expected_net} was processed on {date}, "
        "but no matching UTR was found in the bank statement within 3 business days. "
        "Suggested action: {suggested_action}."
    ),
    "MISSING_SETTLEMENT": (
        "Payment {payment_id} for {expected_net} was captured on {date}, "
        "but has no corresponding settlement batch after 3 business days. "
        "Suggested action: {suggested_action}."
    ),
    "FEE_RATE_MISMATCH": (
        "Settlement {settlement_id} calculated expected fee of {fee}, "
        "but VelocePay reported a different fee amount (Delta: {delta}). "
        "Suggested action: {suggested_action}."
    ),
    "TAX_MISMATCH": (
        "Settlement {settlement_id} reported a GST amount that does not match 18% of the fee. "
        "Suggested action: {suggested_action}."
    ),
    "DUPLICATE_UTR": (
        "UTR {utr} appears multiple times in the bank statements. "
        "Suggested action: {suggested_action}."
    ),
    "REFUND_WITHOUT_PAYMENT": (
        "Refund {refund_id} references payment {payment_id}, which does not exist in the ledger. "
        "Suggested action: {suggested_action}."
    ),
    "REFUND_MDR_UNRECOVERABLE": (
        "Refund {refund_id} processed for payment {payment_id}. "
        "The original MDR fee of {fee} is not recovered. "
        "Suggested action: {suggested_action}."
    ),
    "ADJUSTMENT_UNMATCHED": (
        "Adjustment {adjustment_id} of {delta} has no matching settlement parent. "
        "Suggested action: {suggested_action}."
    ),
    "SETTLEMENT_ON_HOLD": (
        "Settlement {settlement_id} (UTR: {utr}) is flagged as on_hold by VelocePay. "
        "Suggested action: {suggested_action}."
    ),
    "PARTIAL_REFUND_LEDGER_GAP": (
        "Partial refund {refund_id} creates a negative net exposure against payment {payment_id}. "
        "Suggested action: {suggested_action}."
    ),
    "UNMATCHED": (
        "No matching bank entry or settlement could be confidently linked. "
        "Suggested action: {suggested_action}."
    ),
}

SUGGESTED_ACTIONS = {
    "SYSTEMATIC_FEE_DEVIATION":  "AUTO_ESCALATE_TO_VELOCEPAY - file bulk dispute",
    "BANK_CREDIT_SHORTFALL":     "WAIT_FOR_BANK_POSTING or REQUEST_BANK_SWIFT_CONFIRMATION",
    "BANK_CREDIT_EXCESS":        "REVIEW_FOR_MISTAKEN_CREDIT",
    "MISSING_BANK_CREDIT":       "CONTACT_BANK — UTR not found within 3 business days",
    "MISSING_SETTLEMENT":        "CHECK_VELOCEPAY_DASHBOARD — payment may be on hold",
    "FEE_RATE_MISMATCH":         "REQUEST_VELOCEPAY_INVOICE — verify MDR rate agreement",
    "TAX_MISMATCH":              "CHECK_GST_CONFIGURATION",
    "DUPLICATE_UTR":             "ESCALATE_TO_FINANCE — potential double-credit risk",
    "REFUND_WITHOUT_PAYMENT":    "ESCALATE_TO_FINANCE — critical data integrity issue",
    "REFUND_MDR_UNRECOVERABLE":  "ACKNOWLEDGE — informational only",
    "ADJUSTMENT_UNMATCHED":      "REVIEW_MANUAL_ADJUSTMENT",
    "SETTLEMENT_ON_HOLD":        "MONITOR_UNTIL_RELEASED",
    "PARTIAL_REFUND_LEDGER_GAP": "REVIEW_REFUND_POLICY",
    "UNMATCHED":                 "MANUAL_RECONCILIATION_REQUIRED",
}

# Keys whose integer values represent paisa and should be formatted as ₹X.XX
_PAISA_KEYS = frozenset({
    "expected_net", "actual_credit", "delta", "fee", "tax",
})


def _format_paisa(value: int) -> str:
    """Convert integer paisa to ₹X.XX display string."""
    rupees = value / 100
    return f"₹{rupees:,.2f}"


class _SafeDict(dict):
    """dict subclass that returns the placeholder key for missing template vars."""
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def generate_explanation(exception_code: str, context: dict) -> str:
    """
    Render a human-readable explanation for the given exception code.
    Integer paisa values in _PAISA_KEYS are auto-formatted to ₹X.XX.
    Missing context keys are left as placeholders rather than crashing.
    """
    template = EXPLANATION_TEMPLATES.get(
        exception_code,
        "Unknown exception code: " + exception_code + ". Suggested action: {suggested_action}",
    )
    action = SUGGESTED_ACTIONS.get(exception_code, "MANUAL_REVIEW")

    formatted = {**context, "suggested_action": action}

    for key in _PAISA_KEYS:
        val = formatted.get(key)
        if isinstance(val, int):
            formatted[key] = _format_paisa(val)

    explanation = template.format_map(_SafeDict(formatted))
    
    # Feature 1: Counterfactual "near-miss" explanations
    delta = context.get("delta")
    if delta and isinstance(delta, int) and delta != 0:
        abs_delta = _format_paisa(abs(delta))
        direction = "higher" if delta > 0 else "lower"
        explanation += f" [Counterfactual: If the bank credit were {abs_delta} {direction}, this would be a clean match.]"

    return explanation


def get_suggested_action(exception_code: str) -> str:
    return SUGGESTED_ACTIONS.get(exception_code, "MANUAL_REVIEW")
