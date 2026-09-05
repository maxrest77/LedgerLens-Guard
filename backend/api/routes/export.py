from datetime import datetime
from backend.utils.time_utils import utc_now
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase, Reviewer
from backend.export.csv_exporter import generate_cases_csv
from backend.export.pdf_generator import generate_evidence_pack_pdf
from backend.audit.chain import append_to_chain

router = APIRouter()

@router.get("/batch/csv")
async def export_batch_csv(session: Session = Depends(get_db), current_reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"]))):
    query = select(ReconciliationCase).order_by(ReconciliationCase.opened_at.asc())
    if current_reviewer.role != "ADMIN" and getattr(current_reviewer, "portfolio_id", "GLOBAL") != "GLOBAL":
        query = query.where(ReconciliationCase.portfolio_id == current_reviewer.portfolio_id)
    cases = session.exec(query).all()
    
    csv_buffer = generate_cases_csv(cases)
    
    return StreamingResponse(
        csv_buffer, 
        media_type="text/csv", 
        headers={"Content-Disposition": 'attachment; filename="ledgerlens_batch_export.csv"'}
    )

@router.get("/exception/{case_id}/pdf")
async def export_exception_pdf(
    case_id: str, 
    session: Session = Depends(get_db), 
    current_reviewer: Reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"]))
):
    case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == case_id)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Tenancy Scoping
    if current_reviewer.role != "ADMIN" and getattr(current_reviewer, "portfolio_id", "GLOBAL") != "GLOBAL":
        if case.portfolio_id and case.portfolio_id != current_reviewer.portfolio_id:
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")
        
    pdf_buffer = generate_evidence_pack_pdf(case, session=session)
    
    date_str = case.opened_at.strftime("%Y%m%d") if case.opened_at else "20260903"
    clean_code = (case.exception_code or "AUDIT").replace(" ", "_")
    filename = f"LedgerLens_Evidence_Pack_{case_id}_{clean_code}_{date_str}.pdf"
    
    # Task 0.1: Log every evidence access as a chain event
    append_to_chain(
        session=session,
        case_id=case_id,
        reviewer=current_reviewer.email,
        action="EVIDENCE_RETRIEVED",
        reason=f"Evidence Pack PDF retrieved for case {case_id}",
        payload_snapshot={
            "case_id": case_id,
            "resource_type": "EVIDENCE_PACK_PDF",
            "files_accessed": [filename],
            "reviewer": current_reviewer.email,
            "timestamp": utc_now().isoformat()
        }
    )
    session.commit()
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
