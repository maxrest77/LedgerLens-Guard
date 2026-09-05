import re
from typing import Any, Dict, List, Union

# Pattern matching 13 to 19 digit sequences with optional hyphens or spaces
_CARD_PATTERN = re.compile(r'\b(?:\d[ -]*?){13,19}\b')

def is_luhn_valid(number_str: str) -> bool:
    """Validate a numeric string using the Luhn checksum algorithm."""
    digits = [int(d) for d in re.sub(r'\D', '', number_str)]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    reverse_digits = digits[::-1]
    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            d = d * 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0

def mask_pan_luhn(text: str) -> str:
    """
    Scans text for candidate payment card numbers.
    If a candidate matches the Luhn check, masks all but the last 4 digits (PCI-DSS compliant).
    Example: 4532-0150-1234-5678 -> XXXX-XXXX-XXXX-5678
    """
    if not isinstance(text, str):
        return text

    def _replacer(match: re.Match) -> str:
        matched_str = match.group(0)
        clean_digits = re.sub(r'\D', '', matched_str)
        if is_luhn_valid(clean_digits):
            last4 = clean_digits[-4:]
            return f"XXXX-XXXX-XXXX-{last4}"
        return matched_str

    return _CARD_PATTERN.sub(_replacer, text)

def sanitize_payload_for_storage(data: Any) -> Any:
    """
    Recursively masks card numbers across strings, lists, and dicts
    prior to database storage, caching, or logging.
    """
    if isinstance(data, str):
        return mask_pan_luhn(data)
    elif isinstance(data, dict):
        return {k: sanitize_payload_for_storage(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_payload_for_storage(item) for item in data]
    return data
