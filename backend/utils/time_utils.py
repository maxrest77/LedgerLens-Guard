from datetime import datetime, timezone

def utc_now() -> datetime:
    """
    Returns a timezone-naive UTC datetime object.
    
    This replaces deprecated `datetime.utcnow()` across Python 3.12+
    while guaranteeing full compatibility with SQLite string comparisons
    and ISO-8601 expectations.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
