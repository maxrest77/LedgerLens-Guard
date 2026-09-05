import json
from datetime import datetime
from backend.utils.time_utils import utc_now
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from pydantic import BaseModel
from backend.api.auth import get_current_reviewer, get_db, RequireRole
from backend.data.schema import ReconciliationCase, CaseStatus, Reviewer, EvidenceAttachment
from backend.audit.chain import append_to_chain

router = APIRouter()

def _commit_staged_evidence(session: Session, case_id: str, reviewer_email: str, action: str, submitter_role: str = "REVIEWER"):
    """Permanently commits provisional staged evidence documents into the immutable audit chain."""
    staged = session.exec(
        select(EvidenceAttachment).where(
            EvidenceAttachment.case_id == case_id,
            EvidenceAttachment.is_committed == False
        )
    ).all()
    for att in staged:
        try:
            summary = json.loads(att.raw_metadata_json)
        except Exception:
            summary = {}

        if not att.submitter_role or att.submitter_role == "REVIEWER":
            att.submitter_role = submitter_role

        audit_snapshot = {
            "filename": att.filename,
            "file_type": att.file_type,
            "file_sha256": att.file_sha256,
            "file_size_bytes": att.file_size_bytes,
            "submitted_by": reviewer_email,
            "submitter_role": att.submitter_role,
            "total_records": summary.get("total_records", 0),
            "total_amount_paisa": summary.get("total_amount_paisa", 0),
            "pci_masked_count": summary.get("pci_masked_count", 0),
            "submitted_with_action": action
        }
        block = append_to_chain(
            session=session,
            case_id=case_id,
            reviewer=reviewer_email,
            action="EVIDENCE_ATTACHED",
            reason=f"Attached evidence document {att.filename} ({att.file_type}, {summary.get('total_records', 0)} records) submitted by {att.submitter_role} ({reviewer_email}) committed as proof for {action} review.",
            payload_snapshot=audit_snapshot
        )
        att.is_committed = True
        att.uploaded_at = utc_now()
        att.audit_block_id = block.index
        session.add(att)

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
    request: Request,
    case_id: str,
    action_data: ReviewAction,
    session: Session = Depends(get_db),
    current_reviewer = Depends(RequireRole(["REVIEWER", "ADMIN"])),
):
    from backend.api.idempotency import check_idempotency, save_idempotency
    cached_resp, req_hash = check_idempotency(request, session, action_data.model_dump())
    if cached_resp:
        return cached_resp

    from backend.data.schema import ApprovalRequest
    case = session.exec(
        select(ReconciliationCase).where(ReconciliationCase.case_id == case_id)
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if case.status not in (CaseStatus.OPEN, CaseStatus.PENDING_CO_REVIEW, CaseStatus.ESCALATED):
        raise HTTPException(status_code=409, detail="Case is already resolved")

    # Decision: ADMINs have global scope and can view/mutate any case.
    # REVIEWERs must be in-scope for their specific portfolio.
    is_cross_portfolio_admin = False
    if current_reviewer.role != "ADMIN" and current_reviewer.portfolio_id != "GLOBAL":
        if case.portfolio_id != current_reviewer.portfolio_id:
            append_to_chain(
                session=session,
                case_id=case.case_id,
                reviewer=current_reviewer.email,
                action="UNAUTHORIZED_ACCESS_ATTEMPT",
                reason=f"Attempted to mutate case out of scope. Reviewer portfolio: {current_reviewer.portfolio_id}, Case portfolio: {case.portfolio_id}",
                payload_snapshot=case.model_dump(mode="json")
            )
            session.commit()
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")
    elif case.portfolio_id != current_reviewer.portfolio_id:
        is_cross_portfolio_admin = True

    if action_data.action not in _ACTION_TO_STATUS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action '{action_data.action}'. Must be APPROVE, REJECT, or ESCALATE.",
        )

    if len(action_data.reason.strip()) < 20 or len(action_data.reason.strip().split()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Industrial standards require a meaningful review reason of at least 20 characters and 3 words for the audit trail.",
        )

    if len(action_data.reason) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Review reason exceeds maximum length of 2000 characters.",
        )

    import re
    def is_gibberish(text: str) -> bool:
        if any(len(w) > 20 for w in text.split()):
            return True
        if re.search(r'(.)\1{3,}', text):  # 4 consecutive identical chars
            return True
        if re.search(r'[bcdfghjklmnpqrstvwxzBCDFGHJKLMNPQRSTVWXZ]{7,}', text): # 7+ consonants
            return True
        return False

    is_flagged = is_gibberish(action_data.reason)
    flag_msg = "Suspicious input detected (failed entropy/gibberish heuristic)" if is_flagged else None

    import html
    safe_reason = html.escape(action_data.reason)
    
    case.reason_flagged = is_flagged
    case.flag_reason = flag_msg
    
    snapshot = case.model_dump(mode="json")

    # Maker-Checker Workflow for CRITICAL
    if case.severity == "CRITICAL" and action_data.action in ["APPROVE", "REJECT"]:
        if case.status == CaseStatus.OPEN:
            # Commit any staged evidence attached by the Maker
            _commit_staged_evidence(session, case.case_id, current_reviewer.email, action_data.action, submitter_role="MAKER")

            # Maker Stage
            new_req = ApprovalRequest(
                case_id=case.case_id,
                maker_id=current_reviewer.email,
                proposed_action=action_data.action,
                reason=safe_reason,
                reason_flagged=is_flagged,
                flag_reason=flag_msg
            )
            session.add(new_req)
            
            case.status = CaseStatus.PENDING_CO_REVIEW
            case.resolved_by = current_reviewer.email # Maker
            
            block = append_to_chain(
                session=session,
                case_id=case.case_id,
                reviewer=current_reviewer.email,
                action=f"PROPOSE_{action_data.action}",
                reason=safe_reason,
                payload_snapshot=snapshot,
            )
            case.audit_block_id = block.index
            
            session.add(case)
            session.commit()
            session.refresh(case)
            resp_data = {"message": "Case submitted for Admin Approval", "case": case.model_dump(mode="json")}
            save_idempotency(session, request.headers.get("Idempotency-Key"), f"/exceptions/{case_id}/review", req_hash, resp_data)
            return resp_data
            
        elif case.status == CaseStatus.PENDING_CO_REVIEW:
            # Checker Stage
            req = session.exec(
                select(ApprovalRequest)
                .where(ApprovalRequest.case_id == case.case_id)
                .where(ApprovalRequest.status == "PENDING")
            ).first()
            
            if not req:
                raise HTTPException(status_code=400, detail="No pending approval request found.")
                
            if current_reviewer.email == req.maker_id:
                raise HTTPException(
                    status_code=403, 
                    detail="Co-reviewer must be a distinct identity from the first reviewer."
                )
            if current_reviewer.role != "ADMIN":
                raise HTTPException(
                    status_code=403, 
                    detail="Second signature must be from an Admin."
                )

            # Commit any staged evidence attached during Checker stage
            _commit_staged_evidence(session, case.case_id, current_reviewer.email, action_data.action, submitter_role="CHECKER")
                
            # Finalize
            new_status = _ACTION_TO_STATUS[action_data.action] if action_data.action in ["APPROVE", "REJECT"] else _ACTION_TO_STATUS[req.proposed_action]
            
            req.checker_id = current_reviewer.email
            req.status = action_data.action
            req.resolved_at = utc_now()
            
            case.status = new_status
            case.co_reviewer_email = current_reviewer.email
            case.resolved_at = utc_now()
            
            if is_cross_portfolio_admin:
                append_to_chain(
                    session=session,
                    case_id=case.case_id,
                    reviewer=current_reviewer.email,
                    action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
                    reason=f"Admin cross-portfolio override bypass applied for portfolio {case.portfolio_id}. Reviewer portfolio: {current_reviewer.portfolio_id}",
                    payload_snapshot=snapshot,
                )

            block = append_to_chain(
                session=session,
                case_id=case.case_id,
                reviewer=current_reviewer.email,
                action=action_data.action, # The final action taken by the checker
                reason=safe_reason,
                payload_snapshot=snapshot,
            )
            case.audit_block_id = block.index
            
            session.add(req)
            session.add(case)
            session.commit()
            session.refresh(case)
            resp_data = {"message": f"Case {new_status} successfully", "case": case.model_dump(mode="json")}
            save_idempotency(session, request.headers.get("Idempotency-Key"), f"/exceptions/{case_id}/review", req_hash, resp_data)
            return resp_data

    # Standard Workflow (Non-CRITICAL or ESCALATE)
    if case.status == CaseStatus.ESCALATED:
        if current_reviewer.role != "ADMIN":
            raise HTTPException(status_code=403, detail="Only Admins can resolve escalated cases.")
        if current_reviewer.email == case.resolved_by:
            raise HTTPException(status_code=403, detail="Co-reviewer must be a distinct identity from the reviewer who escalated the case.")
        
    new_status = _ACTION_TO_STATUS[action_data.action]
    case.status = new_status
    case.resolved_by = current_reviewer.email
    case.resolved_at = utc_now()
    
    # Commit any staged evidence attached during standard review
    _role = "ADMIN" if current_reviewer.role == "ADMIN" else "REVIEWER"
    _commit_staged_evidence(session, case.case_id, current_reviewer.email, action_data.action, submitter_role=_role)
    
    if is_cross_portfolio_admin:
        append_to_chain(
            session=session,
            case_id=case.case_id,
            reviewer=current_reviewer.email,
            action="ADMIN_CROSS_PORTFOLIO_OVERRIDE",
            reason=f"Admin cross-portfolio override bypass applied for portfolio {case.portfolio_id}. Reviewer portfolio: {current_reviewer.portfolio_id}",
            payload_snapshot=snapshot,
        )

    block = append_to_chain(
        session=session,
        case_id=case.case_id,
        reviewer=current_reviewer.email,
        action=action_data.action,
        reason=safe_reason,
        payload_snapshot=snapshot,
    )
    case.audit_block_id = block.index
    
    session.add(case)
    session.commit()
    session.refresh(case)

    _action_past = {"APPROVE": "APPROVED", "REJECT": "REJECTED", "ESCALATE": "ESCALATED"}
    resp_data = {"message": f"Case {_action_past.get(action_data.action, action_data.action)} successfully", "case": case.model_dump(mode="json")}
    save_idempotency(session, request.headers.get("Idempotency-Key"), f"/exceptions/{case_id}/review", req_hash, resp_data)
    return resp_data
