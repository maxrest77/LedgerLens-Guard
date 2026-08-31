import json
from backend.audit.chain import compute_hash

def test_e1_canonicalization():
    # If the dict is constructed in different orders, the hash should be identical
    # due to sort_keys=True and separators=(',', ':')
    
    payload_snapshot_1 = json.dumps({"a": 1, "b": 2}, sort_keys=True, separators=(',', ':'))
    payload_snapshot_2 = json.dumps({"b": 2, "a": 1}, sort_keys=True, separators=(',', ':'))
    
    hash1 = compute_hash(
        index=1,
        timestamp="2026-01-01T00:00:00",
        case_id="case_1",
        reviewer="rev@test.com",
        action="APPROVE",
        reason="test",
        payload_snapshot=payload_snapshot_1,
        previous_hash="0"*64
    )
    
    hash2 = compute_hash(
        index=1,
        timestamp="2026-01-01T00:00:00",
        case_id="case_1",
        reviewer="rev@test.com",
        action="APPROVE",
        reason="test",
        payload_snapshot=payload_snapshot_2,
        previous_hash="0"*64
    )
    
    assert hash1 == hash2
