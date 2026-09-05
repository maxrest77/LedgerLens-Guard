import os
import pytest
from unittest.mock import MagicMock
from sqlmodel import Session, create_engine, SQLModel
from backend.audit.chain import AuditBlock
from backend.data.schema import ChainAnchor
from backend.jobs.anchoring import anchor_latest_block, verify_anchors

class MockResponse:
    def __init__(self, json_data, status_code):
        self.json_data = json_data
        self.status_code = status_code
    def json(self):
        return self.json_data
    def raise_for_status(self):
        pass

def test_feature2_external_anchor(monkeypatch, tmp_path):
    monkeypatch.setenv("GITHUB_TOKEN", "fake_token")
    
    def mock_post(url, **kwargs):
        return MockResponse({"html_url": "https://gist.github.com/fake_gist"}, 200)
        
    def mock_run(args, **kwargs):
        class CompletedProcess:
            def __init__(self):
                self.returncode = 0
                self.stdout = b""
        if "stamp" in args:
            # write a fake .ots file
            temp_path = args[2]
            with open(temp_path + ".ots", "wb") as f:
                f.write(b"fake_ots_blob")
        return CompletedProcess()
        
    monkeypatch.setattr("httpx.post", mock_post)
    monkeypatch.setattr("subprocess.run", mock_run)
    
    engine = create_engine(f"sqlite:///{tmp_path}/test_f2.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    
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
    
    monkeypatch.setattr("backend.jobs.anchoring.engine", engine)
    anchor_latest_block()
    
    # Verify DB got the records
    with Session(engine) as session:
        from sqlmodel import select
        anchor = session.exec(select(ChainAnchor)).first()
        assert anchor is not None
        assert anchor.chain_hash == "test_hash_1"
        assert anchor.ots_proof_blob == b"fake_ots_blob"
        assert anchor.gist_url == "https://gist.github.com/fake_gist"
        assert anchor.status == "PENDING"

def test_verify_anchor_logic(monkeypatch, tmp_path):
    monkeypatch.setenv("GITHUB_TOKEN", "fake_token")
    
    # We will test two scenarios: match and mismatch
    def mock_get_match(url, **kwargs):
        return MockResponse({"files": {"anchor.txt": {"content": "Timestamp: 123\nChain Hash: fake_hash_1"}}}, 200)
    
    def mock_run_verify(args, **kwargs):
        class CompletedProcess:
            def __init__(self):
                self.returncode = 0
                self.stdout = b"Success"
        if "upgrade" in args:
            ots_path = args[2]
            with open(ots_path, "wb") as f:
                f.write(b"upgraded_blob")
        return CompletedProcess()

    monkeypatch.setattr("httpx.get", mock_get_match)
    monkeypatch.setattr("subprocess.run", mock_run_verify)
    
    engine = create_engine(f"sqlite:///{tmp_path}/test_f2_verify.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("backend.jobs.anchoring.engine", engine)
    
    with Session(engine) as session:
        session.add(AuditBlock(index=1, case_id="c", reviewer="r", action="a", reason="r", payload_snapshot="p", previous_hash="p", block_hash="fake_hash_1"))
        session.add(ChainAnchor(block_index=1, chain_hash="fake_hash_1", ots_proof_blob=b"blob", gist_url="https://gist.github.com/fake", status="PENDING"))
        session.commit()
        
    assert verify_anchors() is True
    
    # Check if upgraded
    with Session(engine) as session:
        import sqlmodel
        anchor = session.exec(sqlmodel.select(ChainAnchor)).first()
        assert anchor.status == "CONFIRMED"
        assert anchor.ots_proof_blob == b"upgraded_blob"

    # Now test mismatch
    def mock_get_mismatch(url, **kwargs):
        return MockResponse({"files": {"anchor.txt": {"content": "Timestamp: 123\nChain Hash: tampered_hash"}}}, 200)
        
    def mock_run_fail(args, **kwargs):
        class CompletedProcess:
            def __init__(self):
                self.returncode = 1
        return CompletedProcess()

    monkeypatch.setattr("httpx.get", mock_get_mismatch)
    monkeypatch.setattr("subprocess.run", mock_run_fail)
    
    # Mismatch check is a bit manual, it logs CRITICAL but returns True overall because it continues
    # We will mock logger.critical to assert it's called
    mock_logger = MagicMock()
    monkeypatch.setattr("backend.jobs.anchoring.logger", mock_logger)
    
    verify_anchors()
    
    assert mock_logger.critical.call_count >= 2 # one for gist mismatch, one for ots failure
