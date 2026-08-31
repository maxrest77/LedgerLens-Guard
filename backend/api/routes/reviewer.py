from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase, CaseStatus, Reviewer
from backend.audit.chain import append_to_chain

router = APIRouter()

# Map frontend action verbs → CaseStatus enum values
_ACTION_TO_STATUS = {
    "APPROVE": CaseStatus.APPROVED,
    "REJECT": CaseStatus.REJECTED,
    "ESCALATE": CaseStatus.ESCALATED,
}

class ReviewAction(BaseModel):
    action: str  # APPROVE, REJECT, ESCALATE
    reason: str


@router.post("/exceptions/{case_id}/review")
async def review_case(
    case_id: str,
    action_data: ReviewAction,
    session: Session = Depends(get_db),
    current_reviewer = Depends(RequireRole(["REVIEWER", "SENIOR_APPROVER", "ADMIN"])),
):
    case = session.exec(
        select(ReconciliationCase).where(ReconciliationCase.case_id == case_id)
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if case.status != CaseStatus.OPEN:
        raise HTTPException(status_code=409, detail="Case is already resolved")

    new_status = _ACTION_TO_STATUS.get(action_data.action)
    if new_status is None:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action '{action_data.action}'. Must be APPROVE, REJECT, or ESCALATE.",
        )

    if len(action_data.reason.strip()) < 20 or len(action_data.reason.strip().split()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Industrial standards require a meaningful review reason of at least 20 characters and 3 words for the audit trail.",
        )

    if action_data.action == "APPROVE" and case.severity == "CRITICAL":
        raise HTTPException(
            status_code=403,
            detail="Cannot directly approve CRITICAL severity cases. Escalation required.",
        )

    # Snapshot current state before mutation
    snapshot = case.model_dump(mode="json")

    # Append to tamper-evident hash chain
    block = append_to_chain(
        session=session,
        case_id=case.case_id,
        reviewer=current_reviewer.email,
        action=action_data.action,
        reason=action_data.reason,
        payload_snapshot=snapshot,
    )

    # Update the case
    case.status = new_status
    case.resolved_at = datetime.utcnow()
    case.resolved_by = current_reviewer.email
    case.audit_block_id = block.index

    session.add(case)
    session.commit()
    session.refresh(case)

    _action_past = {"APPROVE": "APPROVED", "REJECT": "REJECTED", "ESCALATE": "ESCALATED"}
    return {"message": f"Case {_action_past.get(action_data.action, action_data.action)} successfully", "case": case}
