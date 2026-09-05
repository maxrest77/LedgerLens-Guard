from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.audit.chain import AuditBlock, verify_chain

router = APIRouter()

@router.get("/audit")
async def get_audit_chain(
    page: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = Query(None, ge=1, le=500),
    session: Session = Depends(get_db),
    current_reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"]))
):
    total = session.exec(select(func.count(AuditBlock.index))).one()
    query = select(AuditBlock).order_by(AuditBlock.index.asc())
    
    if limit is not None:
        p = page or 1
        query = query.offset((p - 1) * limit).limit(limit)
        blocks = session.exec(query).all()
        return {
            "blocks": blocks,
            "total": total,
            "page": p,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    else:
        blocks = session.exec(query).all()
        return {
            "blocks": blocks,
            "total": total,
            "page": 1,
            "limit": total,
            "pages": 1
        }

@router.get("/audit/verify")
async def verify_audit_chain(session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"]))):
    return verify_chain(session)

@router.get("/audit/admin-overrides")
async def get_audit_admin_overrides(session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["ADMIN"]))):
    from backend.api.routes.analytics import get_admin_overrides
    return await get_admin_overrides(session=session, current_reviewer=current_reviewer)

@router.get("/audit/evidence-retrievals")
async def get_audit_evidence_retrievals(session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["ADMIN"]))):
    from backend.api.routes.analytics import get_evidence_retrievals
    return await get_evidence_retrievals(session=session, current_reviewer=current_reviewer)

