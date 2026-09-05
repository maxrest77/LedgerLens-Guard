from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase

router = APIRouter()

@router.get("/workspace")
@router.get("/reconciliation/workspace")
async def get_workspace(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    exception_code: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = Query("opened_at_desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    session: Session = Depends(get_db),
    current_reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"]))
):
    query = select(ReconciliationCase)
    
    # Portfolio scoping / tenant isolation
    role_name = current_reviewer.role.value if hasattr(current_reviewer.role, "value") else str(current_reviewer.role)
    if role_name != "ADMIN" and getattr(current_reviewer, "portfolio_id", "GLOBAL") != "GLOBAL":
        query = query.where(ReconciliationCase.portfolio_id == current_reviewer.portfolio_id)
    
    if status:
        statuses = [s.strip() for s in status.split(',')]
        query = query.where(ReconciliationCase.status.in_(statuses))
    if severity:
        severities = [s.strip().upper() for s in severity.split(',')]
        if "LOW" in severities or "INFO" in severities:
            severities = list(set(severities + ["LOW", "INFO"]))
        query = query.where(ReconciliationCase.severity.in_(severities))
    if exception_code:
        codes = [c.strip() for c in exception_code.split(',')]
        query = query.where(ReconciliationCase.exception_code.in_(codes))
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (ReconciliationCase.utr.like(search_pattern)) | 
            (ReconciliationCase.case_id.like(search_pattern)) |
            (ReconciliationCase.payment_id.like(search_pattern))
        )
        
    total = session.exec(select(func.count()).select_from(query.subquery())).one()

    # Apply sorting
    if sort_by == "opened_at_asc":
        query = query.order_by(ReconciliationCase.opened_at.asc(), ReconciliationCase.case_id.asc())
    elif sort_by == "delta_desc":
        query = query.order_by(func.abs(ReconciliationCase.delta_paisa).desc())
    elif sort_by == "delta_asc":
        query = query.order_by(func.abs(ReconciliationCase.delta_paisa).asc())
    elif sort_by == "severity_desc":
        from sqlalchemy import case as sql_case
        query = query.order_by(
            sql_case(
                (ReconciliationCase.severity == "CRITICAL", 0),
                (ReconciliationCase.severity == "HIGH", 1),
                (ReconciliationCase.severity == "MEDIUM", 2),
                else_=3
            ),
            func.abs(ReconciliationCase.delta_paisa).desc()
        )
    else:
        query = query.order_by(ReconciliationCase.opened_at.desc(), ReconciliationCase.case_id.desc())
    
    cases = session.exec(query.offset((page - 1) * limit).limit(limit)).all()
    
    # Summary stats scoped to the current reviewer using SQL aggregation
    status_counts_stmt = select(
        ReconciliationCase.status,
        func.count(ReconciliationCase.case_id).label("count"),
        func.coalesce(func.sum(ReconciliationCase.delta_paisa), 0).label("sum_delta")
    )
    if role_name != "ADMIN" and getattr(current_reviewer, "portfolio_id", "GLOBAL") != "GLOBAL":
        status_counts_stmt = status_counts_stmt.where(ReconciliationCase.portfolio_id == current_reviewer.portfolio_id)
    status_counts_stmt = status_counts_stmt.group_by(ReconciliationCase.status)
    
    status_results = session.exec(status_counts_stmt).all()
    status_map = {row[0]: (row[1], row[2]) for row in status_results}
    
    total_count = sum(cnt for cnt, _ in status_map.values())
    open_count = status_map.get("OPEN", (0, 0))[0]
    pending_co_review_count = status_map.get("PENDING_CO_REVIEW", (0, 0))[0]
    escalated_count = status_map.get("ESCALATED", (0, 0))[0]
    approved_count = status_map.get("APPROVED", (0, 0))[0]
    rejected_count = status_map.get("REJECTED", (0, 0))[0]
    auto_resolved_count = status_map.get("AUTO_RESOLVED", (0, 0))[0]
    
    under_review_count = pending_co_review_count + escalated_count
    active_unresolved_count = open_count + under_review_count
    finalized_count = approved_count + rejected_count
    
    total_unresolved_paisa = (
        status_map.get("OPEN", (0, 0))[1] +
        status_map.get("PENDING_CO_REVIEW", (0, 0))[1] +
        status_map.get("ESCALATED", (0, 0))[1]
    )

    codes_stmt = select(ReconciliationCase.exception_code).distinct()
    if role_name != "ADMIN" and getattr(current_reviewer, "portfolio_id", "GLOBAL") != "GLOBAL":
        codes_stmt = codes_stmt.where(ReconciliationCase.portfolio_id == current_reviewer.portfolio_id)
    codes_results = session.exec(codes_stmt).all()
    available_codes = sorted([c for c in codes_results if c])

    return {
        "data": cases,
        "metrics": {
            "total_exceptions": total_count,
            "active_unresolved_count": active_unresolved_count,
            "open_count": open_count,
            "under_review_count": under_review_count,
            "total_unresolved_inr": round(total_unresolved_paisa / 100.0, 2),
            "auto_resolved_count": auto_resolved_count,
            "finalized_count": finalized_count
        },
        "available_codes": available_codes,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit
        }
    }
