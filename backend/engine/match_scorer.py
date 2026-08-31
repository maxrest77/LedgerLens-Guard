from typing import Optional
from backend.data.schema import Payment, Settlement, BankEntry


def calculate_match_confidence(
    payment: Optional[Payment],
    settlement: Optional[Settlement],
    bank_entry: Optional[BankEntry],
    expected_paisa: int,
) -> float:
    """
    Deterministic confidence scorer.

    Tier table (from implementation plan):
        1.00  Exact link + UTR matched + amount exact
        0.95  Exact UTR match, batch net delta = 0 paisa
        0.85  Exact UTR match, batch net delta ≤ 100 paisa (₹1)
        0.70  Exact UTR match, batch net delta ≤ 1% of expected
        0.50  Date proximity ±1 day, amount match ±5%
        <0.50 UNMATCHED
    """
    if not settlement or not bank_entry:
        return 0.0

    if expected_paisa <= 0:
        return 0.0

    delta = abs(expected_paisa - bank_entry.amount_paisa)

    utr_matched = settlement.utr == bank_entry.utr

    if utr_matched:
        # Tier 1: exact amount + linked payment
        if delta == 0 and payment is not None:
            return 1.00

        # Tier 2: exact UTR, zero delta (batch-level match)
        if delta == 0:
            return 0.95

        # Tier 3: tiny rounding difference (≤ ₹1)
        if delta <= 100:
            return 0.85

        # Tier 4: within 1 % of expected
        threshold_1pct = expected_paisa // 100  # integer 1%
        if delta <= threshold_1pct:
            return 0.70

    # Tier 5: fuzzy – date proximity ±1 day, amount within ±5 %
    date_diff = abs((settlement.settled_at.date() - bank_entry.value_date).days)
    threshold_5pct = expected_paisa // 20  # integer 5%
    if date_diff <= 1 and delta <= threshold_5pct:
        return 0.50

    return 0.0
