from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db
from backend.audit.chain import AuditBlock, verify_chain

router = APIRouter()

@router.get("/audit")
async def get_audit_chain(session: Session = Depends(get_db), current_reviewer = Depends(get_current_reviewer)):
    blocks = session.exec(select(AuditBlock).order_by(AuditBlock.index.asc())).all()
    return {"blocks": blocks}

@router.get("/audit/verify")
async def verify_audit_chain(session: Session = Depends(get_db), current_reviewer = Depends(get_current_reviewer)):
    return verify_chain(session)
