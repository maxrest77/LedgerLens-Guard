from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from backend.api.auth import get_current_reviewer, get_db
from backend.data.schema import ReconciliationCase
from backend.export.csv_exporter import generate_cases_csv
from backend.export.pdf_generator import generate_evidence_pack_pdf

router = APIRouter()

@router.get("/batch/csv")
async def export_batch_csv(session: Session = Depends(get_db), current_reviewer = Depends(get_current_reviewer)):
    cases = session.exec(select(ReconciliationCase).order_by(ReconciliationCase.opened_at.asc())).all()
    
    csv_buffer = generate_cases_csv(cases)
    
    return StreamingResponse(
        csv_buffer, 
        media_type="text/csv", 
        headers={"Content-Disposition": 'attachment; filename="ledgerlens_batch_export.csv"'}
    )

@router.get("/exception/{case_id}/pdf")
async def export_exception_pdf(case_id: str, session: Session = Depends(get_db), current_reviewer = Depends(get_current_reviewer)):
    case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == case_id)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    pdf_buffer = generate_evidence_pack_pdf(case)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="evidence_pack_{case_id}.pdf"'}
    )
