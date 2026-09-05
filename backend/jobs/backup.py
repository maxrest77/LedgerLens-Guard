import os
import time
import logging
import sqlite3
import subprocess
from datetime import datetime
from urllib.parse import urlparse
from backend.db.init import DB_FILE, _DB_PATH

from backend.utils.time_utils import utc_now

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

BACKUP_DIR = os.path.join(os.path.dirname(_DB_PATH), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

def perform_backup():
    timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
    
    if DB_FILE.startswith("sqlite"):
        backup_path = os.path.join(BACKUP_DIR, f"ledgerlens_{timestamp}.sqlite3")
        try:
            logger.info(f"Starting SQLite backup to {backup_path}")
            # Use safe online backup API
            source = sqlite3.connect(_DB_PATH)
            dest = sqlite3.connect(backup_path)
            with source, dest:
                source.backup(dest)
            dest.close()
            source.close()
            logger.info("SQLite backup completed successfully.")
        except Exception as e:
            logger.error(f"SQLite backup failed: {e}")
            
    elif DB_FILE.startswith("postgres"):
        backup_path = os.path.join(BACKUP_DIR, f"ledgerlens_{timestamp}.sql")
        try:
            logger.info(f"Starting Postgres backup to {backup_path}")
            # Ensure pg_dump is in environment PATH
            parsed = urlparse(DB_FILE.replace("postgresql+psycopg2", "postgresql"))
            env = os.environ.copy()
            if parsed.password:
                env["PGPASSWORD"] = parsed.password
                
            cmd = [
                "pg_dump",
                "-h", parsed.hostname or "localhost",
                "-p", str(parsed.port or 5432),
                "-U", parsed.username or "postgres",
                "-F", "c", # custom format
                "-f", backup_path,
                parsed.path.lstrip("/")
            ]
            subprocess.run(cmd, env=env, check=True)
            logger.info("Postgres backup completed successfully.")
        except Exception as e:
            logger.error(f"Postgres backup failed: {e}")
    else:
        logger.warning(f"Unsupported database connection string for backup: {DB_FILE}")

if __name__ == "__main__":
    logger.info("Starting backup daemon...")
    while True:
        perform_backup()
        # Run backup every 6 hours
        time.sleep(60 * 60 * 6)
