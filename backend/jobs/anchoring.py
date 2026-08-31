import os
import time
from datetime import datetime
from sqlmodel import Session, select
from backend.audit.chain import AuditBlock
from backend.db.init import engine

def write_to_worm_storage(hash_value: str, timestamp: str):
    """
    Simulates writing strictly one-way to an external Write-Once Read-Many (WORM) 
    cloud storage bucket (e.g. AWS S3 with Object Lock or an immutable ledger).
    """
    anchor_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "worm_anchor")
    os.makedirs(anchor_dir, exist_ok=True)
    anchor_file = os.path.join(anchor_dir, "anchor_log.txt")
    
    # In WORM, we can only append new files or append to a log.
    with open(anchor_file, "a") as f:
        f.write(f"{timestamp},{hash_value}\n")
    print(f"Anchored hash {hash_value} at {timestamp}")

def anchor_latest_block():
    """
    Fetches the latest block hash from the database and publishes it to the external anchor.
    """
    with Session(engine) as session:
        latest_block = session.exec(
            select(AuditBlock).order_by(AuditBlock.index.desc()).limit(1)
        ).first()
        
        if latest_block:
            write_to_worm_storage(
                hash_value=latest_block.block_hash,
                timestamp=datetime.utcnow().isoformat()
            )

if __name__ == "__main__":
    print("Starting external anchoring job...")
    while True:
        anchor_latest_block()
        time.sleep(60) # Anchor every 1 minute
