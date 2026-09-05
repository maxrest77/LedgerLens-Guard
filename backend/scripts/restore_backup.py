import os
import sys
import shutil
import logging
import subprocess
from sqlmodel import Session, create_engine
from urllib.parse import urlparse
from backend.db.init import DB_FILE, _DB_PATH
from backend.audit.chain import verify_chain

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def restore_backup(backup_path: str):
    if not os.path.exists(backup_path):
        logger.error(f"Backup file not found: {backup_path}")
        sys.exit(1)
        
    if DB_FILE.startswith("sqlite"):
        logger.info(f"Restoring SQLite database from {backup_path}")
        try:
            shutil.copy2(backup_path, _DB_PATH)
            logger.info("SQLite restore completed successfully.")
        except Exception as e:
            logger.error(f"SQLite restore failed: {e}")
            sys.exit(1)
            
    elif DB_FILE.startswith("postgres"):
        logger.info(f"Restoring Postgres database from {backup_path}")
        try:
            parsed = urlparse(DB_FILE.replace("postgresql+psycopg2", "postgresql"))
            env = os.environ.copy()
            if parsed.password:
                env["PGPASSWORD"] = parsed.password
                
            cmd = [
                "pg_restore",
                "-h", parsed.hostname or "localhost",
                "-p", str(parsed.port or 5432),
                "-U", parsed.username or "postgres",
                "-d", parsed.path.lstrip("/"),
                "--clean", "--if-exists",
                backup_path
            ]
            subprocess.run(cmd, env=env, check=True)
            logger.info("Postgres restore completed successfully.")
        except Exception as e:
            logger.error(f"Postgres restore failed: {e}")
            sys.exit(1)
    else:
        logger.error(f"Unsupported database connection string for restore: {DB_FILE}")
        sys.exit(1)
        
    # Verify the audit chain integrity post-restore
    logger.info("Running verify_chain() on restored database...")
    engine = create_engine(DB_FILE, connect_args={"check_same_thread": False} if DB_FILE.startswith("sqlite") else {})
    with Session(engine) as session:
        is_valid, msg = verify_chain(session)
        if not is_valid:
            logger.critical(f"RESTORE FAILURE: Audit chain verification failed! {msg}")
            sys.exit(1)
        else:
            logger.info("Audit chain successfully verified intact post-restore.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python restore_backup.py <path_to_backup_file>")
        sys.exit(1)
    restore_backup(sys.argv[1])
