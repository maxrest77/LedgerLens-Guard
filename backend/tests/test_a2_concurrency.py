import pytest
import threading
from sqlmodel import Session, SQLModel, create_engine
from backend.audit.chain import AuditBlock, append_to_chain, verify_chain
from backend.data.schema import Reviewer, Role

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_concurrency.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

def test_a2_concurrent_chain_append(engine):
    """
    Simulates concurrent writers to the audit chain to verify that the retry loop
    prevents IntegrityError and keeps the chain perfectly intact and verified.
    """
    exceptions = []
    
    def worker(worker_id):
        try:
            with Session(engine) as session:
                append_to_chain(
                    session=session,
                    case_id=f"case_conc_{worker_id}",
                    reviewer=f"reviewer_{worker_id}",
                    action="TEST_ACTION",
                    reason="concurrency test",
                    payload_snapshot={"data": worker_id}
                )
        except Exception as e:
            exceptions.append(e)

    threads = []
    for i in range(15):
        t = threading.Thread(target=worker, args=(i,))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    # There should be no exceptions (retries should have handled SQLite/Postgres contention)
    assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
    
    with Session(engine) as session:
        result = verify_chain(session)
        assert result["valid"] is True
        
        # Ensure all 15 blocks are present
        from sqlmodel import select
        blocks = session.exec(select(AuditBlock)).all()
        assert len(blocks) == 15
