import os
import pytest
from sqlmodel import Session, create_engine, SQLModel
from backend.audit.chain import AuditBlock
from backend.jobs.anchoring import anchor_latest_block, write_to_worm_storage
from backend.scripts.verify_anchor import verify_against_anchor

def test_feature2_external_anchor(tmp_path, monkeypatch):
    # Override WORM path to tmp_path
    def mock_write(hash_value, timestamp):
        anchor_file = tmp_path / "anchor_log.txt"
        with open(anchor_file, "a") as f:
            f.write(f"{timestamp},{hash_value}\n")
            
    monkeypatch.setattr("backend.jobs.anchoring.write_to_worm_storage", mock_write)
    
    # Override the path that verify_anchor reads from
    def mock_verify():
        anchor_file = tmp_path / "anchor_log.txt"
        anchors = []
        with open(anchor_file, "r") as f:
            for line in f:
                if line.strip():
                    ts, h = line.strip().split(",")
                    anchors.append({"timestamp": ts, "hash": h})
        
        # We need an engine, let's use the actual default engine logic but override the DB logic inside our test
        return anchors
    
    # We will test the core components since we're injecting mocks
    engine = create_engine(f"sqlite:///{tmp_path}/test_f2.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    # Create a block
    with Session(engine) as session:
        session.add(AuditBlock(
            index=1,
            case_id="case_1",
            reviewer="rev",
            action="ACT",
            reason="test",
            payload_snapshot="{}",
            previous_hash="0"*64,
            block_hash="test_hash_1"
        ))
        session.commit()
    
    # Run anchor job (monkeypatch engine inside anchoring)
    monkeypatch.setattr("backend.jobs.anchoring.engine", engine)
    anchor_latest_block()
    
    assert (tmp_path / "anchor_log.txt").exists()
    
    # Verify
    monkeypatch.setattr("backend.scripts.verify_anchor.engine", engine)
    monkeypatch.setattr("os.path.dirname", lambda x: str(tmp_path))
    
    # Instead of monkeypatching dirname heavily, let's just monkeypatch the file path variable if possible
    # Wait, the script has it hardcoded, I'll just write it to the actual WORM directory in the test and clean up,
    # or I can just modify the script to take a path.
    pass

def test_verify_anchor_logic(tmp_path, monkeypatch):
    # Let's adjust verify_anchor to accept an optional file path
    import backend.scripts.verify_anchor as va
    
    anchor_file = tmp_path / "anchor_log.txt"
    with open(anchor_file, "w") as f:
        f.write("2026-01-01,fake_hash_1\n")
        
    engine = create_engine(f"sqlite:///{tmp_path}/test_f2_verify.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
    monkeypatch.setattr(va, "engine", engine)
    
    # Should fail because fake_hash_1 isn't in DB
    assert va.verify_against_anchor(anchor_file_override=str(anchor_file)) is False
    
    # Add it
    with Session(engine) as session:
        session.add(AuditBlock(
            index=1,
            case_id="c",
            reviewer="r",
            action="a",
            reason="r",
            payload_snapshot="p",
            previous_hash="p",
            block_hash="fake_hash_1"
        ))
        session.commit()
        
    assert va.verify_against_anchor(anchor_file_override=str(anchor_file)) is True
