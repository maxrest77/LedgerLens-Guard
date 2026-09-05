import os
import sys
import argparse
import logging
from typing import Optional, Dict, Any

# Ensure repository root is on sys.path
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from sqlmodel import SQLModel, create_engine
from sqlalchemy import text
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql

# Import all models so they register with SQLModel.metadata
from backend.data.schema import *
from backend.audit.chain import AuditBlock

logger = logging.getLogger("migration")

def validate_postgres_ddl() -> Dict[str, str]:
    """
    Compiles DDL for all SQLModel tables using the PostgreSQL dialect.
    Returns a dictionary of {table_name: compiled_sql_ddl}.
    Raises an exception if any table or column fails PostgreSQL compilation.
    """
    pg_dialect = postgresql.dialect()
    compiled_ddls = {}
    for table in SQLModel.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=pg_dialect)).strip()
        compiled_ddls[table.name] = ddl
    return compiled_ddls

def migrate(
    sqlite_engine=None,
    pg_engine=None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Migrates data from SQLite into PostgreSQL in strict topological dependency order.
    
    If dry_run is True:
      - Validates PostgreSQL DDL compilation for all registered tables.
      - Inspects the source SQLite database and counts rows per table.
      - Produces a plan without executing writes to PostgreSQL.
    """
    if sqlite_engine is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ledgerlens.db")
        sqlite_url = f"sqlite:///{db_path}"
        sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

    # Validate DDL compilation for Postgres
    print("[DRY-RUN / VALIDATE] Compiling schemas for PostgreSQL dialect...")
    ddls = validate_postgres_ddl()
    print(f"  -> Successfully compiled {len(ddls)} tables to PostgreSQL DDL.")

    # Inspect source database
    table_stats = {}
    total_source_rows = 0
    with sqlite_engine.connect() as sqlite_conn:
        for table in SQLModel.metadata.sorted_tables:
            try:
                count = sqlite_conn.execute(text(f"SELECT COUNT(*) FROM {table.name}")).scalar() or 0
            except Exception:
                # Table might not exist yet in source SQLite
                count = 0
            table_stats[table.name] = count
            total_source_rows += count

    print(f"\n[TABLE AUDIT] Found {total_source_rows} total rows across {len(table_stats)} tables:")
    for tname, cnt in table_stats.items():
        if cnt > 0:
            print(f"  - {tname}: {cnt} rows")

    if dry_run:
        print("\n[DRY-RUN COMPLETE] Migration plan verified. 0 writes executed.")
        return {
            "status": "DRY_RUN_SUCCESS",
            "dry_run": True,
            "total_tables": len(table_stats),
            "total_rows": total_source_rows,
            "tables": table_stats,
            "ddl_sample": {k: ddls[k][:120] + "..." for k in list(ddls.keys())[:3]}
        }

    # If executing live migration
    if pg_engine is None:
        pg_url = os.getenv("POSTGRES_URL", "postgresql+psycopg2://ledger_user:ledger_password@localhost:5432/ledgerlens")
        print(f"\nConnecting to target database: {pg_url}")
        pg_engine = create_engine(pg_url)

    print("Creating/updating schema in target database...")
    SQLModel.metadata.create_all(pg_engine)

    is_postgres = pg_engine.dialect.name == "postgresql"
    migrated_stats = {}

    with sqlite_engine.connect() as sqlite_conn, pg_engine.begin() as pg_conn:
        if is_postgres:
            pg_conn.execute(text("SET session_replication_role = 'replica';"))

        for table in SQLModel.metadata.sorted_tables:
            # Delete existing data if idempotent rerun
            pg_conn.execute(table.delete())

            # Fetch all rows from sqlite
            rows = sqlite_conn.execute(table.select()).fetchall()
            if not rows:
                migrated_stats[table.name] = 0
                continue

            insert_dicts = [dict(zip(table.columns.keys(), row)) for row in rows]
            pg_conn.execute(table.insert(), insert_dicts)
            migrated_stats[table.name] = len(insert_dicts)
            print(f"  -> Migrated {len(insert_dicts)} rows into {table.name}")

        if is_postgres:
            pg_conn.execute(text("SET session_replication_role = 'origin';"))

    print("\n[MIGRATION SUCCESS] Live migration completed successfully!")
    return {
        "status": "MIGRATION_SUCCESS",
        "dry_run": False,
        "total_tables": len(migrated_stats),
        "total_rows": sum(migrated_stats.values()),
        "tables": migrated_stats
    }

def main():
    parser = argparse.ArgumentParser(description="Migrate LedgerLens Guard from SQLite to PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", help="Validate schema and table dependencies without writing to Postgres")
    args = parser.parse_args()

    result = migrate(dry_run=args.dry_run)
    print(f"Result: {result['status']}")

if __name__ == "__main__":
    main()
