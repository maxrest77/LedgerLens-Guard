from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase

router = APIRouter()

@router.get("/workspace")
async def get_workspace(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    session: Session = Depends(get_db),
    current_reviewer = Depends(RequireRole(["REVIEWER", "SENIOR_APPROVER", "AUDITOR", "ADMIN"]))
):
    query = select(ReconciliationCase)
    
    if status:
        query = query.where(ReconciliationCase.status == status)
    if severity:
        query = query.where(ReconciliationCase.severity == severity)
    if search:
        # Simple search on UTR or case_id
        search_pattern = f"%{search}%"
        query = query.where(
            (ReconciliationCase.utr.like(search_pattern)) | 
            (ReconciliationCase.case_id.like(search_pattern)) |
            (ReconciliationCase.payment_id.like(search_pattern))
        )
        
    total = len(session.exec(query).all())
    
    cases = session.exec(query.offset((page - 1) * limit).limit(limit)).all()
    
    return {
        "data": cases,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit
        }
    }
