from sqlmodel import Session, select
from backend.audit.chain import AuditBlock
from backend.data.schema import ReconciliationCase
from datetime import datetime

def evaluate_reviewer_risk(session: Session) -> dict:
    """
    Evaluates reviewer behavior patterns from the immutable audit chain.
    Identifies rubber-stamping and rapid-fire approvals to flag for compliance officers.
    Strictly read-only; does not take automated action against reviewers.
    """
    blocks = session.exec(select(AuditBlock)).all()
    
    # We only care about human decisions, not system
    human_blocks = [b for b in blocks if not b.reviewer.startswith("system_")]
    
    reviewer_stats = {}
    
    for block in human_blocks:
        if block.reviewer not in reviewer_stats:
            reviewer_stats[block.reviewer] = {
                "total_decisions": 0,
                "approvals": 0,
                "total_time_seconds": 0,
                "cases_processed": set()
            }
        
        stats = reviewer_stats[block.reviewer]
        stats["total_decisions"] += 1
        
        if block.action == "APPROVE":
            stats["approvals"] += 1
            
        if block.case_id not in stats["cases_processed"]:
            case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == block.case_id)).first()
            if case:
                # Calculate time to decision
                try:
                    block_time = datetime.fromisoformat(block.timestamp)
                    # opened_at is a datetime object
                    time_diff = (block_time - case.opened_at).total_seconds()
                    if time_diff > 0:
                        stats["total_time_seconds"] += time_diff
                except Exception:
                    pass
            stats["cases_processed"].add(block.case_id)
            
    risk_flags = []
    
    for reviewer, stats in reviewer_stats.items():
        if stats["total_decisions"] < 3:
            continue # Need minimum volume for statistical significance
            
        rubber_stamp_rate = stats["approvals"] / stats["total_decisions"]
        avg_time = stats["total_time_seconds"] / stats["total_decisions"]
        
        flags = []
        if rubber_stamp_rate > 0.90:
            flags.append(f"High rubber-stamp rate: {rubber_stamp_rate:.1%} approvals")
            
        if avg_time < 5.0:
            flags.append(f"Suspiciously rapid decisions: {avg_time:.1f}s average")
            
        if flags:
            risk_flags.append({
                "reviewer": reviewer,
                "rubber_stamp_rate": rubber_stamp_rate,
                "avg_decision_time_s": avg_time,
                "flags": flags,
                "risk_level": "HIGH" if len(flags) > 1 else "MEDIUM"
            })
            
    return {
        "anomalous_reviewers": risk_flags,
        "total_reviewers_analyzed": len(reviewer_stats)
    }
