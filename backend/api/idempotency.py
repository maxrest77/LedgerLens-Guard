import hashlib
import json
from datetime import datetime
from backend.utils.time_utils import utc_now
from fastapi import Request, HTTPException
from sqlmodel import Session, select
from backend.data.schema import IdempotencyKey
from fastapi.responses import JSONResponse

def check_idempotency(request: Request, session: Session, payload: dict):
    idem_key = request.headers.get('Idempotency-Key')
    if not idem_key:
        raise HTTPException(status_code=400, detail='Idempotency-Key header is required')
        
    req_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode('utf-8')).hexdigest()
    
    existing = session.exec(select(IdempotencyKey).where(IdempotencyKey.key == idem_key)).first()
    if existing:
        if existing.request_hash != req_hash:
            raise HTTPException(status_code=409, detail='Idempotency-Key reused with different payload')
        return JSONResponse(status_code=existing.status_code, content=json.loads(existing.response_snapshot)), req_hash
        
    return None, req_hash

def save_idempotency(session: Session, idem_key: str, endpoint: str, req_hash: str, response_data: dict, status_code: int = 200):
    new_idem = IdempotencyKey(
        key=idem_key,
        endpoint=endpoint,
        request_hash=req_hash,
        response_snapshot=json.dumps(response_data),
        status_code=status_code,
        created_at=utc_now()
    )
    session.add(new_idem)
    session.commit()
