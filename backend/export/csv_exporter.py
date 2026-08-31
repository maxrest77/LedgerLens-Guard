import csv
import io
from typing import List
from backend.data.schema import ReconciliationCase

def generate_cases_csv(cases: List[ReconciliationCase]) -> io.StringIO:
    """
    Generates a CSV string buffer for the provided cases.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "case_id", "status", "severity", "exception_code",
        "settlement_id", "utr", "payment_id", 
        "expected_paisa", "actual_paisa", "delta_paisa", 
        "confidence_score", "opened_at", "resolved_at", "resolved_by"
    ])
    
    for c in cases:
        writer.writerow([
            c.case_id,
            c.status.value,
            c.severity,
            c.exception_code,
            c.settlement_id or "",
            c.utr or "",
            c.payment_id or "",
            c.expected_paisa,
            c.actual_paisa,
            c.delta_paisa,
            f"{c.confidence_score:.2f}",
            c.opened_at.isoformat() if c.opened_at else "",
            c.resolved_at.isoformat() if c.resolved_at else "",
            c.resolved_by or ""
        ])
        
    output.seek(0)
    return output
