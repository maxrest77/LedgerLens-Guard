import os
from sqlmodel import SQLModel, create_engine
from backend.data.schema import *
from backend.audit.chain import AuditBlock

# Resolve DB path relative to THIS file so it's always backend/ledgerlens.db
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DB_PATH = os.path.join(_BACKEND_DIR, "ledgerlens.db")
DB_FILE = os.getenv("DATABASE_URL", f"sqlite:///{_DB_PATH}")
engine = create_engine(DB_FILE, echo=False)

def init_db():
    """Create the SQLite database and all tables."""
    print(f"Initializing database at {DB_FILE}...")
    SQLModel.metadata.create_all(engine)
    print("Database schema created successfully.")

if __name__ == "__main__":
    init_db()
