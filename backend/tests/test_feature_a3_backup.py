import os
import sqlite3
import shutil
import tempfile
from sqlmodel import Session, create_engine, SQLModel
from backend.jobs.backup import perform_backup, BACKUP_DIR
from backend.scripts.restore_backup import restore_backup
import backend.db.init as init_mod
from backend.audit.chain import AuditBlock, append_to_chain

def test_sqlite_backup_and_restore(monkeypatch, tmp_path):
    # 1. Setup a dummy source DB
    db_path = str(tmp_path / "ledgerlens.db")
    monkeypatch.setattr(init_mod, "_DB_PATH", db_path)
    monkeypatch.setattr(init_mod, "DB_FILE", f"sqlite:///{db_path}")
    
    engine = create_engine(f"sqlite:///{db_path}")
    SQLModel.metadata.create_all(engine)
    
    # 2. Generate a valid audit chain in the DB
    with Session(engine) as session:
        append_to_chain(session, "case1", "alice@test.com", "APPROVE", "looks good", {"amount": 100})
        append_to_chain(session, "case2", "bob@test.com", "REJECT", "fraud", {"amount": 500})
        session.commit()
    
    engine.dispose()
    
    # 3. Perform backup
    import backend.jobs.backup
    monkeypatch.setattr(backend.jobs.backup, "_DB_PATH", db_path)
    monkeypatch.setattr(backend.jobs.backup, "DB_FILE", f"sqlite:///{db_path}")
    
    backend.jobs.backup.perform_backup()
    
    backups = os.listdir(BACKUP_DIR)
    assert len(backups) > 0
    latest_backup = sorted([b for b in backups if b.endswith(".sqlite3")])[-1]
    backup_path = os.path.join(BACKUP_DIR, latest_backup)
    
    # 4. Simulate catastrophic loss
    os.remove(db_path)
    assert not os.path.exists(db_path)
    
    # 5. Restore (which automatically verifies the chain)
    import backend.scripts.restore_backup
    monkeypatch.setattr(backend.scripts.restore_backup, "_DB_PATH", db_path)
    monkeypatch.setattr(backend.scripts.restore_backup, "DB_FILE", f"sqlite:///{db_path}")
    
    backend.scripts.restore_backup.restore_backup(backup_path)
    
    # 6. Verify data integrity explicitly
    assert os.path.exists(db_path)
    engine2 = create_engine(f"sqlite:///{db_path}")
    with Session(engine2) as session:
        blocks = session.query(AuditBlock).all()
        assert len(blocks) == 2
        assert blocks[0].case_id == "case1"
        assert blocks[1].case_id == "case2"
    engine2.dispose()
    
    # Clean up
    os.remove(backup_path)
