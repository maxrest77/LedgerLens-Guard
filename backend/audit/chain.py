import json
import hashlib
import threading
import copy
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Session, select

class AuditBlock(SQLModel, table=True):
    """
    Cryptographic tamper-evident hash chain block.
    """
    index: Optional[int] = Field(default=None, primary_key=True)
    timestamp: str = Field(default="")
    case_id: str
    reviewer: str
    action: str
    reason: str
    payload_snapshot: str
    previous_hash: str
    block_hash: str

def compute_hash(index: int, timestamp: str, case_id: str, reviewer: str, action: str, reason: str, payload_snapshot: str, previous_hash: str) -> str:
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

import hmac
from backend.config.settings import settings

_chain_lock = threading.RLock()

def get_pii_hash(value: str) -> str:
    """
    Computes a pseudonymized hash for PII using HMAC-SHA256 with a secret server pepper.
    This prevents offline dictionary and rainbow-table re-identification over small-entropy email namespaces.
    """
    if not value:
        return value
    pepper = (settings.SECRET_KEY or "ledgerlens-default-audit-pepper").encode('utf-8')
    return hmac.new(pepper, value.encode('utf-8'), hashlib.sha256).hexdigest()

def append_to_chain(session: Session, case_id: str, reviewer: str, action: str, reason: str, payload_snapshot: dict, timestamp: Optional[str] = None) -> AuditBlock:
    from backend.data.schema import AuditState

    with _chain_lock:
        state = session.exec(select(AuditState).where(AuditState.id == 1).with_for_update()).first()

        if not state:
            state = AuditState(id=1, last_index=-1, last_hash="0" * 64)
            session.add(state)
            session.flush()

        new_index = state.last_index + 1
        prev_hash = state.last_hash

        # DPDP Erasure Fix: Pseudonymize PII *before* generating block
        safe_reviewer = get_pii_hash(reviewer)
        
        safe_payload = copy.deepcopy(payload_snapshot)
        for field in ["resolved_by", "co_reviewer_email", "maker_id", "checker_id", "proposed_by", "approved_by", "owner"]:
            if field in safe_payload and safe_payload[field]:
                safe_payload[field] = get_pii_hash(safe_payload[field])

        from backend.utils.time_utils import utc_now
        timestamp_str = timestamp or utc_now().isoformat()
        payload_str = json.dumps(safe_payload, sort_keys=True, separators=(',', ':'))

        b_hash = compute_hash(
            index=new_index,
            timestamp=timestamp_str,
            case_id=case_id,
            reviewer=safe_reviewer,
            action=action,
            reason=reason,
            payload_snapshot=payload_str,
            previous_hash=prev_hash
        )

        new_block = AuditBlock(
            index=new_index,
            timestamp=timestamp_str,
            case_id=case_id,
            reviewer=safe_reviewer,
            action=action,
            reason=reason,
            payload_snapshot=payload_str,
            previous_hash=prev_hash,
            block_hash=b_hash
        )

        session.add(new_block)
        state.last_index = new_index
        state.last_hash = b_hash
        session.add(state)

        return new_block

def verify_chain(session: Session) -> dict:
    blocks = session.exec(select(AuditBlock).order_by(AuditBlock.index.asc())).all()

    expected_prev_hash = "0" * 64
    for block in blocks:
        if block.previous_hash != expected_prev_hash:
            return {"valid": False, "tampered_at_index": block.index}

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
