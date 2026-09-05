import pytest
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql

from backend.data.schema import (
    Reviewer, Role, ReconciliationCase, CaseStatus,
    Settlement, Payment, AuditState
)
from backend.audit.chain import AuditBlock, append_to_chain, verify_chain
from backend.scripts.migrate_sqlite_to_postgres import (
    validate_postgres_ddl, migrate
)
from backend.utils import utc_now

def test_postgres_ddl_compilation():
    """
    Verify that all 20+ SQLModel tables compile successfully
    using the PostgreSQL dialect without SQL syntax errors.
    """
    ddls = validate_postgres_ddl()
    assert len(ddls) >= 15
    assert "auditblock" in ddls
    assert "reconciliationcase" in ddls
    assert "reviewer" in ddls
    
    # Check that postgres-specific dialect types compile
    audit_ddl = ddls["auditblock"]
    assert "CREATE TABLE auditblock" in audit_ddl
    assert "block_hash" in audit_ddl
    assert "previous_hash" in audit_ddl

def test_dependency_topological_sort():
    """
    Verify table dependency sorting ensures tables without foreign keys
    precede tables that depend on them.
    """
    sorted_names = [t.name for t in SQLModel.metadata.sorted_tables]
    
    # Reviewer and ReconciliationCase should precede child tables
    if "reconciliationcase" in sorted_names and "approvalrequest" in sorted_names:
        assert sorted_names.index("reconciliationcase") < sorted_names.index("approvalrequest")

def test_migration_dry_run():
    """
    Verify that migrate(dry_run=True) audits schemas and counts without writing.
    """
    result = migrate(dry_run=True)
    assert result["status"] == "DRY_RUN_SUCCESS"
    assert result["dry_run"] is True
    assert result["total_tables"] >= 15
    assert isinstance(result["tables"], dict)

def test_data_and_worm_chain_migration_fidelity(tmp_path):
    """
    End-to-end migration verification:
    1. Seed a source database with cases and a WORM audit chain.
    2. Migrate all data to target database.
    3. Assert 100% row preservation and WORM cryptographic integrity.
    """
    source_db = tmp_path / "source.db"
    target_db = tmp_path / "target.db"
    
    source_engine = create_engine(f"sqlite:///{source_db}", connect_args={"check_same_thread": False})
    target_engine = create_engine(f"sqlite:///{target_db}", connect_args={"check_same_thread": False})
    
    SQLModel.metadata.create_all(source_engine)
    
    # Seed source database
    with Session(source_engine) as session:
        # Create Reviewer
        admin = Reviewer(
            id=1,
            email="admin_mig@test.com",
            hashed_password="hashed_test_pass",
            role=Role.ADMIN,
            portfolio_id="GLOBAL"
        )
        session.add(admin)
        
        # Create Case
        case = ReconciliationCase(
            case_id="MIG-001",
            portfolio_id="GLOBAL",
            exception_code="TEST_DEVIATION",
            severity="HIGH",
            status=CaseStatus.OPEN,
            expected_paisa=100000,
            actual_paisa=98000,
            delta_paisa=2000,
            confidence_score=0.95,
            explanation="Test explanation",
            suggested_action="Review manually",
            opened_at=utc_now()
        )
        session.add(case)
        session.commit()
        
        # Append 3 WORM audit blocks
        b1 = append_to_chain(session, "MIG-001", "system", "SYSTEM_INIT", "Migration source initialized", {"detail": "init"})
        b2 = append_to_chain(session, "MIG-001", "system", "CASE_CREATED", "Case recorded", {"case_id": "MIG-001", "paisa": 100000})
        b3 = append_to_chain(session, "MIG-001", "admin_mig@test.com", "STATUS_CHECK", "Verification pass", {"check": "passed"})
        session.commit()
        
        # Verify source chain is valid
        source_verification = verify_chain(session)
        assert source_verification["valid"] is True
        assert source_verification["tampered_at_index"] is None
        assert len(session.exec(select(AuditBlock)).all()) == 3

    # Execute migration from source to target
    result = migrate(sqlite_engine=source_engine, pg_engine=target_engine, dry_run=False)
    assert result["status"] == "MIGRATION_SUCCESS"
    assert result["dry_run"] is False
    assert result["tables"]["reviewer"] == 1
    assert result["tables"]["reconciliationcase"] == 1
    assert result["tables"]["auditblock"] == 3

    # Verify target database
    with Session(target_engine) as target_session:
        migrated_reviewers = target_session.exec(select(Reviewer)).all()
        assert len(migrated_reviewers) == 1
        assert migrated_reviewers[0].email == "admin_mig@test.com"

        migrated_cases = target_session.exec(select(ReconciliationCase)).all()
        assert len(migrated_cases) == 1
        assert migrated_cases[0].case_id == "MIG-001"
        assert migrated_cases[0].delta_paisa == 2000

        migrated_blocks = target_session.exec(select(AuditBlock).order_by(AuditBlock.index.asc())).all()
        assert len(migrated_blocks) == 3
        assert migrated_blocks[0].action == "SYSTEM_INIT"
        assert migrated_blocks[1].action == "CASE_CREATED"
        assert migrated_blocks[2].action == "STATUS_CHECK"

        # Verify WORM cryptographic chain validity on migrated target
        target_verification = verify_chain(target_session)
        assert target_verification["valid"] is True
        assert target_verification["tampered_at_index"] is None
