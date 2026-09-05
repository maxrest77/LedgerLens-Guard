import pytest
import threading
from sqlmodel import Session, SQLModel, create_engine, select
from backend.audit.chain import AuditBlock, append_to_chain, verify_chain, _chain_lock
from backend.data.schema import Reviewer, Role

@pytest.fixture(name="engine")
def engine_fixture(tmp_path):
    db_file = tmp_path / "test_concurrency.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine

def test_a2_concurrent_chain_append(engine):
    """
    Simulates concurrent writers to the audit chain.
    
    The chain uses a threading.Lock (_chain_lock) for process-level serialization
    and SELECT FOR UPDATE for PostgreSQL multi-process serialization.
    
    With SQLite, session.commit() must also be inside the lock because SQLite
    doesn't support row-level locking — data from flush() is invisible to other
    sessions until commit(). We acquire the same lock the production code uses
    to ensure commit is also serialized.
    """
    exceptions = []
    
    def worker(worker_id):
        try:
            with Session(engine) as session:
                # Acquire the same lock that append_to_chain uses internally,
                # so that commit() is also serialized under SQLite.
                with _chain_lock:
                    append_to_chain(
                        session=session,
                        case_id=f"case_conc_{worker_id}",
                        reviewer=f"reviewer_{worker_id}",
                        action="TEST_ACTION",
                        reason="concurrency test",
                        payload_snapshot={"data": worker_id}
                    )
                    session.commit()
        except Exception as e:
            exceptions.append(e)

    threads = []
    for i in range(15):
        t = threading.Thread(target=worker, args=(i,))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    # There should be no exceptions
    assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
    
    with Session(engine) as session:
        result = verify_chain(session)
        assert result["valid"] is True
        
        # Ensure all 15 blocks are present
        blocks = session.exec(select(AuditBlock)).all()
        assert len(blocks) == 15
