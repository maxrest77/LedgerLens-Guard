import os
import time
import json
import logging
import httpx
import tempfile
import subprocess
from datetime import datetime
from sqlmodel import Session, select
from backend.audit.chain import AuditBlock
from backend.data.schema import ChainAnchor
from backend.db.init import engine

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def create_gist(hash_value: str, timestamp: str, case_count: int) -> str | None:
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        logger.warning("GITHUB_TOKEN not set. Skipping gist anchor.")
        return None
        
    content = f"Timestamp: {timestamp}\nChain Hash: {hash_value}\nCase Count: {case_count}"
    payload = {
        "description": "LedgerLens Guard Audit Anchor",
        "public": True,
        "files": {
            f"anchor_{timestamp.replace(':', '-')}.txt": {
                "content": content
            }
        }
    }
    
    try:
        resp = httpx.post(
            "https://api.github.com/gists",
            json=payload,
            headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"},
            timeout=10.0
        )
        resp.raise_for_status()
        gist_url = resp.json().get("html_url")
        logger.info(f"Created gist anchor: {gist_url}")
        return gist_url
    except Exception as e:
        logger.error(f"Gist creation failed: {e}")
        return None

def create_ots_stamp(hash_value: str) -> bytes | None:
    try:
        with tempfile.NamedTemporaryFile(delete=False, mode="w", suffix=".txt") as f:
            f.write(hash_value)
            temp_path = f.name
            
        subprocess.run(["ots", "stamp", temp_path], check=True, capture_output=True)
        ots_path = temp_path + ".ots"
        
        blob = None
        if os.path.exists(ots_path):
            with open(ots_path, "rb") as f:
                blob = f.read()
            os.remove(ots_path)
        os.remove(temp_path)
        
        if blob:
            logger.info("Created OTS stamp successfully.")
        return blob
    except Exception as e:
        logger.error(f"OTS stamp failed: {e}")
        return None

def anchor_latest_block():
    with Session(engine) as session:
        latest_block = session.exec(
            select(AuditBlock).order_by(AuditBlock.index.desc()).limit(1)
        ).first()
        
        if not latest_block:
            return
            
        from backend.utils.time_utils import utc_now
        timestamp = utc_now().isoformat()
        gist_url = create_gist(latest_block.block_hash, timestamp, latest_block.index)
        ots_blob = create_ots_stamp(latest_block.block_hash)
        
        anchor = ChainAnchor(
            block_index=latest_block.index,
            chain_hash=latest_block.block_hash,
            ots_proof_blob=ots_blob,
            gist_url=gist_url,
            status="PENDING",
            created_at=utc_now()
        )
        session.add(anchor)
        session.commit()

def verify_anchors():
    with Session(engine) as session:
        anchors = session.exec(select(ChainAnchor)).all()
        for anchor in anchors:
            local_block = session.exec(select(AuditBlock).where(AuditBlock.index == anchor.block_index)).first()
            if not local_block:
                logger.critical(f"CHAIN_ANCHOR_MISMATCH: Block {anchor.block_index} missing locally.")
                continue
                
            if local_block.block_hash != anchor.chain_hash:
                logger.critical(f"CHAIN_ANCHOR_MISMATCH: Local hash for {anchor.block_index} differs from stored anchor hash.")
                continue
                
            # Verify Gist
            if anchor.gist_url:
                api_url = anchor.gist_url.replace("gist.github.com", "api.github.com/gists")
                try:
                    resp = httpx.get(api_url, timeout=10.0)
                    if resp.status_code == 200:
                        gist_data = resp.json()
                        files = gist_data.get("files", {})
                        content_match = False
                        for filename, filedata in files.items():
                            if anchor.chain_hash in filedata.get("content", ""):
                                content_match = True
                                break
                        if not content_match:
                            logger.critical(f"CHAIN_ANCHOR_MISMATCH: Gist {anchor.gist_url} no longer contains hash {anchor.chain_hash}")
                except Exception as e:
                    logger.error(f"Failed to fetch gist {anchor.gist_url}: {e}")
            
            # Verify OTS
            if anchor.ots_proof_blob:
                try:
                    with tempfile.NamedTemporaryFile(delete=False, mode="w", suffix=".txt") as f:
                        f.write(local_block.block_hash)
                        temp_path = f.name
                    ots_path = temp_path + ".ots"
                    with open(ots_path, "wb") as f:
                        f.write(anchor.ots_proof_blob)
                        
                    if anchor.status == "PENDING":
                        subprocess.run(["ots", "upgrade", ots_path], capture_output=True)
                        with open(ots_path, "rb") as f:
                            upgraded_blob = f.read()
                        if upgraded_blob != anchor.ots_proof_blob:
                            anchor.ots_proof_blob = upgraded_blob
                            session.add(anchor)
                            session.commit()
                            
                    res = subprocess.run(["ots", "verify", ots_path], capture_output=True)
                    
                    if res.returncode == 0:
                        if anchor.status == "PENDING":
                            anchor.status = "CONFIRMED"
                            session.add(anchor)
                            session.commit()
                    else:
                        if anchor.status == "CONFIRMED":
                            logger.critical(f"CHAIN_ANCHOR_MISMATCH: OTS verification failed for confirmed proof block {anchor.block_index}")
                
                except Exception as e:
                    logger.error(f"OTS verification error: {e}")
                finally:
                    if 'ots_path' in locals() and os.path.exists(ots_path): os.remove(ots_path)
                    if 'temp_path' in locals() and os.path.exists(temp_path): os.remove(temp_path)
                    
    logger.info("Anchor verification cycle complete.")
    return True

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        verify_anchors()
    else:
        while True:
            anchor_latest_block()
            time.sleep(60)
