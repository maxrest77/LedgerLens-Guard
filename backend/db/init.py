import os
from sqlmodel import SQLModel, create_engine
from backend.data.schema import *
from backend.audit.chain import AuditBlock

# Resolve DB path relative to THIS file so it's always backend/ledgerlens.db
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DB_PATH = os.path.join(_BACKEND_DIR, "ledgerlens.db")

ENVIRONMENT = os.getenv("ENV", "development")
if ENVIRONMENT == "development":
    DEFAULT_DB = f"sqlite:///{_DB_PATH}"
else:
    DEFAULT_DB = "postgresql+psycopg2://ledger_user:ledger_password@localhost:5432/ledgerlens"

DB_FILE = os.getenv("DATABASE_URL", DEFAULT_DB)
# If postgres, ensure we use psycopg2
if DB_FILE.startswith("postgres://"):
    DB_FILE = DB_FILE.replace("postgres://", "postgresql+psycopg2://", 1)
elif DB_FILE.startswith("postgresql://"):
    DB_FILE = DB_FILE.replace("postgresql://", "postgresql+psycopg2://", 1)

if DB_FILE.startswith("sqlite"):
    engine = create_engine(DB_FILE, echo=False, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DB_FILE, echo=False)

def init_db():
    """Create the SQLite/Postgres database and all tables."""
    print(f"Initializing database at {DB_FILE}...")
    SQLModel.metadata.create_all(engine)
    print("Database schema created successfully.")

if __name__ == "__main__":
    init_db()
