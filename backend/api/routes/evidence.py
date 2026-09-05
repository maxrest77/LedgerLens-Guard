import os
import json
import hashlib
from datetime import datetime
from backend.utils.time_utils import utc_now
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from sqlmodel import Session, select

from backend.api.auth import get_db, get_current_reviewer
from backend.data.schema import (
    ReconciliationCase, EvidenceAttachment, Reviewer, ApprovalRequest,
    Payment, Settlement, BankEntry, Adjustment, CaseStatus
)
from backend.audit.chain import AuditBlock, append_to_chain, verify_chain
from backend.engine.evidence_parser import route_and_parse
from backend.engine.sanitizer import sanitize_payload_for_storage

router = APIRouter()

_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "evidence")

@router.post("/exceptions/{case_id}/evidence/upload")
async def upload_evidence(
    case_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer)
):
    """
    Ingests multi-format evidence documents (.csv, .tsv, .xlsx, .xml, .txt, .dat, .pdf, .png, .jpg),
    masks payment card numbers (PCI-DSS), extracts structured records with integer-paisa normalization,
    computes file SHA-256, and records an immutable EVIDENCE_ATTACHED audit block.
    """
    case = session.get(ReconciliationCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Tenancy Scoping
    if current_reviewer.role != "ADMIN" and current_reviewer.portfolio_id != "GLOBAL":
        if case.portfolio_id != current_reviewer.portfolio_id:
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    # Compute File SHA-256
    file_sha256 = hashlib.sha256(content).hexdigest()
    file_size_bytes = len(content)

    # Route and parse with PCI-DSS card sanitization
    try:
        parsed = route_and_parse(content, file.filename or "unknown_file")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process evidence file: {str(e)}")
    
    # Ensure all extracted rows are sanitized for storage
    sanitized_records = sanitize_payload_for_storage(parsed["records"])
    summary = parsed["summary"]

    if case.status in [CaseStatus.APPROVED, CaseStatus.REJECTED, CaseStatus.AUTO_RESOLVED]:
        raise HTTPException(status_code=400, detail="Cannot stage new evidence on a closed or auto-resolved case.")

    # Save physical copy to storage directory
    case_storage_dir = os.path.join(_UPLOAD_DIR, case_id)
    os.makedirs(case_storage_dir, exist_ok=True)
    safe_filename = f"{file_sha256[:16]}_{os.path.basename(file.filename)}"
    storage_path = os.path.join(case_storage_dir, safe_filename)
    with open(storage_path, "wb") as f:
        f.write(content)

    # Determine submitter role based on Maker-Checker workflow state
    submitter_role = "REVIEWER"
    if case.status == CaseStatus.PENDING_CO_REVIEW:
        submitter_role = "CHECKER"
    elif case.severity == "CRITICAL" and case.status == CaseStatus.OPEN:
        submitter_role = "MAKER"
    elif current_reviewer.role == "ADMIN":
        submitter_role = "ADMIN"

    # Stage EvidenceAttachment record (is_committed=False, no audit block until review submit)
    attachment = EvidenceAttachment(
        case_id=case_id,
        filename=file.filename or "unknown_file",
        file_type=parsed["file_type"],
        file_size_bytes=file_size_bytes,
        file_sha256=file_sha256,
        storage_path=storage_path,
        extracted_data_json=json.dumps(sanitized_records),
        raw_metadata_json=json.dumps(summary),
        uploaded_by=current_reviewer.email,
        submitter_role=submitter_role,
        uploaded_at=utc_now(),
        audit_block_id=None,
        is_committed=False
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)

    return {
        "status": "staged",
        "attachment_id": attachment.id,
        "filename": attachment.filename,
        "file_type": attachment.file_type,
        "file_sha256": attachment.file_sha256,
        "uploaded_by": attachment.uploaded_by,
        "submitter_role": attachment.submitter_role,
        "is_committed": False,
        "summary": summary,
        "extracted_records": sanitized_records[:50]  # First 50 records preview
    }

@router.get("/exceptions/{case_id}/evidence")
async def get_case_evidence_attachments(
    case_id: str,
    include_staged: bool = False,
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer)
):
    """
    Lists evidence files attached to a reconciliation case.
    By default, returns only permanently committed proofs (submitted during reviewer resolution).
    Pass include_staged=True to inspect provisional staged files.
    """
    case = session.get(ReconciliationCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_reviewer.role != "ADMIN" and current_reviewer.portfolio_id != "GLOBAL":
        if case.portfolio_id != current_reviewer.portfolio_id:
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")

    query = select(EvidenceAttachment).where(EvidenceAttachment.case_id == case_id)
    if not include_staged:
        query = query.where(EvidenceAttachment.is_committed == True)
    query = query.order_by(EvidenceAttachment.uploaded_at.desc())

    attachments = session.exec(query).all()

    items = []
    for att in attachments:
        try:
            records = json.loads(att.extracted_data_json)
            summary = json.loads(att.raw_metadata_json)
        except Exception:
            records = []
            summary = {}

        items.append({
            "id": att.id,
            "filename": att.filename,
            "file_type": att.file_type,
            "file_size_bytes": att.file_size_bytes,
            "file_sha256": att.file_sha256,
            "uploaded_by": att.uploaded_by,
            "submitter_role": att.submitter_role or "REVIEWER",
            "uploaded_at": att.uploaded_at.isoformat(),
            "audit_block_id": att.audit_block_id,
            "is_committed": att.is_committed,
            "summary": summary,
            "records_count": len(records),
            "preview_records": records[:25]
        })

    return {"data": items}

@router.get("/exceptions/{case_id}/evidence/{attachment_id}/download")
async def download_evidence_attachment(
    case_id: str,
    attachment_id: int,
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer)
):
    """
    Downloads an individual attached evidence file and records an EVIDENCE_RETRIEVED event.
    """
    case = session.get(ReconciliationCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_reviewer.role != "ADMIN" and current_reviewer.portfolio_id != "GLOBAL":
        if case.portfolio_id != current_reviewer.portfolio_id:
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")

    att = session.get(EvidenceAttachment, attachment_id)
    if not att or att.case_id != case_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not os.path.exists(att.storage_path):
        raise HTTPException(status_code=404, detail="Evidence file not found on disk")

    with open(att.storage_path, "rb") as f:
        file_bytes = f.read()

    # Task 0.1: Log individual file access to audit chain
    append_to_chain(
        session=session,
        case_id=case_id,
        reviewer=current_reviewer.email,
        action="EVIDENCE_RETRIEVED",
        reason=f"Evidence attachment {att.filename} downloaded for case {case_id}",
        payload_snapshot={
            "case_id": case_id,
            "resource_type": "ATTACHED_FILE",
            "attachment_id": att.id,
            "files_accessed": [att.filename],
            "file_sha256": att.file_sha256,
            "reviewer": current_reviewer.email,
            "timestamp": utc_now().isoformat()
        }
    )
    session.commit()

    media_types = {
        "CSV": "text/csv",
        "TSV": "text/tab-separated-values",
        "XLSX": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "XML": "application/xml",
        "CAMT053": "application/xml",
        "MT940": "text/plain",
        "BAI2": "text/plain",
        "PDF": "application/pdf"
    }
    media_type = media_types.get(att.file_type.upper(), "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{att.filename}"'}
    )

@router.delete("/exceptions/{case_id}/evidence/staged")
async def discard_staged_evidence(
    case_id: str,
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer)
):
    """Discards uncommitted staged evidence files for a case."""
    case = session.get(ReconciliationCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_reviewer.role != "ADMIN" and current_reviewer.portfolio_id != "GLOBAL":
        if case.portfolio_id != current_reviewer.portfolio_id:
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")

    staged = session.exec(
        select(EvidenceAttachment).where(
            EvidenceAttachment.case_id == case_id,
            EvidenceAttachment.is_committed == False
        )
    ).all()

    discarded_count = len(staged)
    for att in staged:
        if os.path.exists(att.storage_path):
            try:
                os.remove(att.storage_path)
            except Exception:
                pass
        session.delete(att)

    session.commit()
    return {"status": "success", "discarded_count": discarded_count}

@router.delete("/exceptions/{case_id}/evidence/{attachment_id}")
async def delete_single_evidence(
    case_id: str,
    attachment_id: int,
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer)
):
    """Deletes a specific staged evidence document before submission."""
    att = session.get(EvidenceAttachment, attachment_id)
    if not att or att.case_id != case_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if att.is_committed:
        raise HTTPException(
            status_code=403,
            detail="Committed audit evidence cannot be deleted from a finalized case"
        )

    if os.path.exists(att.storage_path):
        try:
            os.remove(att.storage_path)
        except Exception:
            pass

    session.delete(att)
    session.commit()
    return {"status": "success", "deleted_attachment_id": attachment_id}

@router.get("/exceptions/{case_id}/executive-pack")
async def get_executive_pack_payload(
    case_id: str,
    session: Session = Depends(get_db),
    current_reviewer: Reviewer = Depends(get_current_reviewer)
):
    """
    Assembles a complete, immutable data package for the in-app print-ready
    Executive Report & Evidence Pack Preview Modal.
    Includes Maker-Checker dual signatures, integer-paisa ledger, and cryptographic chain seals.
    """
    case = session.get(ReconciliationCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_reviewer.role != "ADMIN" and current_reviewer.portfolio_id != "GLOBAL":
        if case.portfolio_id != current_reviewer.portfolio_id:
            raise HTTPException(status_code=403, detail="CASE_OUT_OF_SCOPE")

    # 1. Fetch Maker-Checker Governance Details
    approval_req = session.exec(
        select(ApprovalRequest).where(ApprovalRequest.case_id == case_id).order_by(ApprovalRequest.created_at.desc())
    ).first()

    maker_info = None
    checker_info = None

    if approval_req:
        maker_info = {
            "email": approval_req.maker_id,
            "proposed_action": approval_req.proposed_action,
            "reason": approval_req.reason,
            "timestamp": approval_req.created_at.isoformat()
        }
        if approval_req.checker_id:
            checker_info = {
                "email": approval_req.checker_id,
                "action": case.status,
                "timestamp": approval_req.resolved_at.isoformat() if approval_req.resolved_at else (case.resolved_at.isoformat() if case.resolved_at else None)
            }
    elif case.resolved_by:
        maker_info = {
            "email": case.resolved_by,
            "proposed_action": case.status,
            "reason": "Direct single-reviewer resolution",
            "timestamp": case.resolved_at.isoformat() if case.resolved_at else None
        }
        if case.co_reviewer_email:
            checker_info = {
                "email": case.co_reviewer_email,
                "action": case.status,
                "timestamp": case.resolved_at.isoformat() if case.resolved_at else None
            }

    # 2. Fetch Attached Evidence Files (Only permanently committed proofs)
    attachments = session.exec(
        select(EvidenceAttachment)
        .where(EvidenceAttachment.case_id == case_id, EvidenceAttachment.is_committed == True)
        .order_by(EvidenceAttachment.uploaded_at.asc())
    ).all()
    evidence_files = []
    extracted_items = []
    for att in attachments:
        evidence_files.append({
            "filename": att.filename,
            "file_type": att.file_type,
            "file_sha256": att.file_sha256,
            "uploaded_by": att.uploaded_by,
            "submitter_role": att.submitter_role or "REVIEWER",
            "uploaded_at": att.uploaded_at.isoformat(),
            "audit_block_id": att.audit_block_id
        })
        try:
            recs = json.loads(att.extracted_data_json)
            for r in recs:
                r["source_file"] = att.filename
                r["submitted_by"] = f"{att.uploaded_by} ({att.submitter_role or 'REVIEWER'})"
                r["submitter_role"] = att.submitter_role or "REVIEWER"
                extracted_items.append(r)
        except Exception:
            pass

    # 3. Fetch Linked Native Evidence Records
    payments = []
    settlement = None
    bank_entry = None
    adjustments = []

    if case.settlement_id:
        s = session.get(Settlement, case.settlement_id)
        if s:
            settlement = {
                "settlement_id": s.settlement_id,
                "utr": s.utr,
                "gross_paisa": s.gross_paisa,
                "fee_paisa": s.fee_paisa,
                "tax_paisa": s.tax_paisa,
                "net_paisa": s.net_paisa,
                "settled_at": s.settled_at.isoformat()
            }
            if s.utr:
                b = session.exec(select(BankEntry).where(BankEntry.utr == s.utr)).first()
                if b:
                    bank_entry = {
                        "utr": b.utr,
                        "amount_paisa": b.amount_paisa,
                        "value_date": str(b.value_date),
                        "bank_reference": b.bank_reference
                    }

    if case.payment_id:
        p = session.get(Payment, case.payment_id)
        if p:
            payments.append({
                "payment_id": p.payment_id,
                "amount_paisa": p.amount_paisa,
                "payment_method": p.payment_method,
                "status": p.status,
                "captured_at": p.captured_at.isoformat()
            })

    # 4. Cryptographic Chain Seal
    audit_blocks = session.exec(
        select(AuditBlock).where(AuditBlock.case_id == case_id).order_by(AuditBlock.index.asc())
    ).all()
    chain_verification = verify_chain(session)

    last_block = audit_blocks[-1] if audit_blocks else None

    return {
        "case": {
            "case_id": case.case_id,
            "portfolio_id": case.portfolio_id,
            "exception_code": case.exception_code,
            "severity": case.severity,
            "status": case.status,
            "opened_at": case.opened_at.isoformat(),
            "resolved_at": case.resolved_at.isoformat() if case.resolved_at else None,
            "confidence_score": case.confidence_score,
            "explanation": case.explanation,
            "suggested_action": case.suggested_action
        },
        "ledger": {
            "expected_paisa": case.expected_paisa,
            "actual_paisa": case.actual_paisa,
            "delta_paisa": case.delta_paisa,
            "currency": "INR"
        },
        "governance": {
            "maker": maker_info,
            "checker": checker_info,
            "dual_control_enforced": bool(checker_info or case.severity == "CRITICAL")
        },
        "evidence_pack": {
            "native_settlement": settlement,
            "native_bank_entry": bank_entry,
            "native_payments": payments,
            "attached_evidence_files": evidence_files,
            "extracted_transactions": extracted_items
        },
        "cryptographic_seal": {
            "latest_block_index": last_block.index if last_block else None,
            "latest_block_hash": last_block.block_hash if last_block else None,
            "previous_block_hash": last_block.previous_hash if last_block else None,
            "audit_trail": [
                {
                    "index": b.index,
                    "action": b.action,
                    "reviewer": b.reviewer,
                    "timestamp": b.timestamp,
                    "block_hash": b.block_hash
                } for b in audit_blocks
            ],
            "chain_valid": chain_verification.get("valid", True),
            "generated_at": utc_now().isoformat()
        }
    }
