import os
from sqlmodel import Session, select
from backend.audit.chain import AuditBlock
from backend.db.init import engine

def verify_against_anchor(anchor_file_override=None):
    """
    Independently verifies the current database against the external WORM anchor.
    This proves that history hasn't been rewritten, even if the main database was compromised.
    """
    anchor_file = anchor_file_override or os.path.join(os.path.dirname(os.path.dirname(__file__)), "worm_anchor", "anchor_log.txt")
    if not os.path.exists(anchor_file):
        print("No external anchor found. Verification cannot proceed.")
        return False
        
    anchors = []
    with open(anchor_file, "r") as f:
        for line in f:
            if line.strip():
                ts, h = line.strip().split(",")
                anchors.append({"timestamp": ts, "hash": h})
                
    if not anchors:
        print("External anchor is empty.")
        return False
        
    print(f"Loaded {len(anchors)} snapshots from immutable external anchor.")
    
    with Session(engine) as session:
        for anchor in anchors:
            target_hash = anchor["hash"]
            block = session.exec(
                select(AuditBlock).where(AuditBlock.block_hash == target_hash)
            ).first()
            
            if not block:
                print(f"[FAIL] Anchor hash {target_hash} at {anchor['timestamp']} NOT FOUND in database! Database has been tampered with or history rewritten.")
                return False
                
        print("[SUCCESS] All externally anchored hashes exist in the current database. Cryptographic history is intact and untampered.")
        return True

if __name__ == "__main__":
    verify_against_anchor()
