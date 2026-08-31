import json
import hashlib
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Session, select

class AuditBlock(SQLModel, table=True):
    """
    Cryptographic tamper-evident hash chain block.
    """
    index: Optional[int] = Field(default=None, primary_key=True)
    timestamp: str = Field(default="")  # ISO string to avoid SQLite datetime serialization issues
    case_id: str
    reviewer: str
    action: str
    reason: str
    payload_snapshot: str  # JSON string of the case state at the time
    previous_hash: str
    block_hash: str

def compute_hash(index: int, timestamp: str, case_id: str, reviewer: str, action: str, reason: str, payload_snapshot: str, previous_hash: str) -> str:
    """Computes SHA-256 hash of a block deterministically."""
    data = {
        "index": index,
        "timestamp": timestamp,
        "case_id": case_id,
        "reviewer": reviewer,
        "action": action,
        "reason": reason,
        "payload_snapshot": payload_snapshot,
        "previous_hash": previous_hash
    }
    encoded = json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()

def append_to_chain(session: Session, case_id: str, reviewer: str, action: str, reason: str, payload_snapshot: dict) -> AuditBlock:
    """
    Appends a new action to the tamper-evident audit chain.
    Retrieves the last block to form the cryptographic link.
    Handles concurrent appends safely via a retry loop.
    """
    from sqlalchemy.exc import IntegrityError
    
    max_retries = 3
    for attempt in range(max_retries):
        last_block = session.exec(select(AuditBlock).order_by(AuditBlock.index.desc()).limit(1)).first()
        
        new_index = (last_block.index + 1) if last_block else 0
        prev_hash = last_block.block_hash if last_block else "0" * 64
        
        # Store as ISO string directly to guarantee hash consistency on verification
        timestamp_str = datetime.utcnow().isoformat()
        payload_str = json.dumps(payload_snapshot, sort_keys=True, separators=(',', ':'))
        
        b_hash = compute_hash(
            index=new_index,
            timestamp=timestamp_str,
            case_id=case_id,
            reviewer=reviewer,
            action=action,
            reason=reason,
            payload_snapshot=payload_str,
            previous_hash=prev_hash
        )
        
        new_block = AuditBlock(
            index=new_index,
            timestamp=timestamp_str,
            case_id=case_id,
            reviewer=reviewer,
            action=action,
            reason=reason,
            payload_snapshot=payload_str,
            previous_hash=prev_hash,
            block_hash=b_hash
        )
        
        try:
            # We must use nested transaction or plain savepoint if possible.
            # However, if we're in a session, an IntegrityError invalidates the transaction.
            # To be safe, we'll try to add and commit.
            # Since append_to_chain is often called inside a broader transaction, 
            # we should use session.begin_nested() to allow partial rollback.
            with session.begin_nested():
                session.add(new_block)
            session.commit()
            session.refresh(new_block)
            return new_block
        except IntegrityError:
            # If session.begin_nested() failed, the nested transaction rolled back
            # but the main session is still active. Retry.
            if attempt < max_retries - 1:
                continue
            raise RuntimeError("Failed to append to audit chain due to high concurrency")

def verify_chain(session: Session) -> dict:
    """
    Iterates over the entire chain and recalculates hashes.
    Returns { "valid": bool, "tampered_at_index": int | None }
    """
    blocks = session.exec(select(AuditBlock).order_by(AuditBlock.index.asc())).all()
    
    expected_prev_hash = "0" * 64
    for block in blocks:
        if block.previous_hash != expected_prev_hash:
            return {"valid": False, "tampered_at_index": block.index}
        
        # timestamp is already stored as a string — no conversion needed
        calculated_hash = compute_hash(
            index=block.index,
            timestamp=block.timestamp,
            case_id=block.case_id,
            reviewer=block.reviewer,
            action=block.action,
            reason=block.reason,
            payload_snapshot=block.payload_snapshot,
            previous_hash=block.previous_hash
        )
        
        if calculated_hash != block.block_hash:
            return {"valid": False, "tampered_at_index": block.index}
        
        expected_prev_hash = block.block_hash
        
    return {"valid": True, "tampered_at_index": None}
