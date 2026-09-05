import hashlib
import secrets
import uuid
import os
from datetime import datetime, timedelta
from backend.utils.time_utils import utc_now
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Header, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from jose import JWTError, jwt

from backend.api.auth import get_db, get_current_reviewer, create_access_token, SECRET_KEY, ALGORITHM, pwd_context
from backend.audit.chain import append_to_chain, AuditBlock
from backend.data.schema import Reviewer, Role, ReconciliationCase, EvidenceAttachment, AuditShareLink
from backend.export.pdf_generator import generate_evidence_pack_pdf

router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class GenerateVaultLinkRequest(BaseModel):
    case_id: str
    expiry_hours: int = Field(default=24, ge=1, le=168)

class GenerateVaultLinkResponse(BaseModel):
    share_id: str
    token: str
    otp: str
    share_url: str
    expires_at: str
    case_id: str

class VerifyVaultOtpRequest(BaseModel):
    token: str
    otp: str

class VerifyVaultOtpResponse(BaseModel):
    success: bool
    vault_token: str
    case_id: str
    expires_at: str

# ── Vault Auth Helper ─────────────────────────────────────────────────────────

def get_vault_context(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Validates temporary auditor vault token issued after successful OTP verification.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid vault authorization token.")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Vault session expired or token invalid.")
    
    share_id = payload.get("share_id")
    case_id = payload.get("case_id")
    if not share_id or not case_id:
        raise HTTPException(status_code=401, detail="Malformed vault credentials.")
    
    link = session.exec(select(AuditShareLink).where(AuditShareLink.share_id == share_id)).first()
    if not link or link.is_revoked:
        raise HTTPException(status_code=403, detail="This auditor link has been revoked or deleted.")
    
    if utc_now() > link.expires_at:
        raise HTTPException(status_code=410, detail="This auditor session has expired.")
    
    return {
        "share_id": share_id,
        "case_id": case_id,
        "created_by": link.created_by
    }

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateVaultLinkResponse)
def generate_vault_link(
    payload: GenerateVaultLinkRequest,
    current_reviewer: Reviewer = Depends(get_current_reviewer),
    session: Session = Depends(get_db)
):
    """
    Admin generates a secure time-limited auditor share link and 6-digit OTP.
    """
    if current_reviewer.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Only Admins can generate external auditor access links.")

    case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == payload.case_id)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Target reconciliation case not found.")

    share_id = str(uuid.uuid4())
    raw_token = secrets.token_urlsafe(32)
    raw_otp = f"{secrets.randbelow(900000) + 100000:06d}"

    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    # High-security slow hash (bcrypt) prevents brute-forcing 6-digit numeric search space if database leaks
    otp_hash = pwd_context.hash(f"{raw_otp}:{share_id}")

    expires_at = utc_now() + timedelta(hours=payload.expiry_hours)

    link = AuditShareLink(
        share_id=share_id,
        case_id=payload.case_id,
        token_hash=token_hash,
        otp_hash=otp_hash,
        created_by=current_reviewer.email,
        expires_at=expires_at,
        failed_attempts=0,
        max_attempts=3,
        is_revoked=False
    )
    session.add(link)
    session.commit()

    # Seal issuance event in the cryptographic audit hash chain
    append_to_chain(
        session=session,
        case_id=payload.case_id,
        reviewer=current_reviewer.email,
        action="AUDIT_SHARE_LINK_ISSUED",
        reason=f"Admin issued secure dual-factor auditor link expiring in {payload.expiry_hours} hours. Share ID: {share_id}",
        payload_snapshot={
            "share_id": share_id,
            "case_id": payload.case_id,
            "expires_at": expires_at.isoformat(),
            "max_attempts": 3
        }
    )
    session.commit()

    return GenerateVaultLinkResponse(
        share_id=share_id,
        token=raw_token,
        otp=raw_otp,
        share_url=f"/vault/access/{raw_token}",
        expires_at=expires_at.isoformat(),
        case_id=payload.case_id
    )

@router.post("/verify", response_model=VerifyVaultOtpResponse)
def verify_vault_otp(
    payload: VerifyVaultOtpRequest,
    session: Session = Depends(get_db)
):
    """
    Auditor submits token + OTP. If verified within attempt limit, returns a temporary session token.
    """
    token_hash = hashlib.sha256(payload.token.strip().encode("utf-8")).hexdigest()
    link = session.exec(select(AuditShareLink).where(AuditShareLink.token_hash == token_hash)).first()

    if not link or link.is_revoked:
        raise HTTPException(status_code=404, detail="Invalid, revoked, or non-existent audit link.")

    if link.failed_attempts >= link.max_attempts:
        raise HTTPException(
            status_code=429,
            detail="Too many invalid OTP attempts. This access link has been permanently locked for security."
        )

    if utc_now() > link.expires_at:
        raise HTTPException(status_code=410, detail="This audit link has expired.")

    # High-security slow hash (bcrypt) constant-time verification
    if not pwd_context.verify(f"{payload.otp.strip()}:{link.share_id}", link.otp_hash):
        link.failed_attempts += 1
        session.add(link)
        session.commit()
        remaining = max(0, link.max_attempts - link.failed_attempts)
        if remaining == 0:
            raise HTTPException(
                status_code=429,
                detail="Invalid OTP. Maximum attempts exceeded. This link is now permanently locked."
            )
        raise HTTPException(
            status_code=401,
            detail=f"Invalid 6-digit OTP. {remaining} attempt(s) remaining before link lockout."
        )

    # Success: update access stats
    link.last_accessed_at = utc_now()
    link.access_count += 1
    session.add(link)
    session.commit()

    # Issue 2-hour scoped vault session token
    vault_token = create_access_token(
        data={
            "sub": f"auditor:{link.share_id}",
            "case_id": link.case_id,
            "share_id": link.share_id
        },
        expires_delta=timedelta(hours=2)
    )

    return VerifyVaultOtpResponse(
        success=True,
        vault_token=vault_token,
        case_id=link.case_id,
        expires_at=link.expires_at.isoformat()
    )

@router.get("/dossier")
def get_vault_dossier(
    context: Dict[str, Any] = Depends(get_vault_context),
    session: Session = Depends(get_db)
):
    """
    Returns watermarked forensic dossier for external auditor view.
    """
    case_id = context["case_id"]
    case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == case_id)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case record not found.")

    # Attached committed evidence files
    attachments = session.exec(
        select(EvidenceAttachment)
        .where(EvidenceAttachment.case_id == case_id)
        .where(EvidenceAttachment.is_committed == True)
        .order_by(EvidenceAttachment.uploaded_at.asc())
    ).all()

    file_manifest = []
    for att in attachments:
        file_manifest.append({
            "attachment_id": att.id,
            "filename": att.filename,
            "file_type": att.file_type,
            "file_size_bytes": att.file_size_bytes,
            "file_sha256": att.file_sha256,
            "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None,
            "submitter_role": att.submitter_role
        })

    # Latest audit block for cryptographic proof
    block = session.exec(
        select(AuditBlock)
        .where(AuditBlock.case_id == case_id)
        .order_by(AuditBlock.index.desc())
    ).first()

    audit_proof = None
    if block:
        audit_proof = {
            "block_index": block.index,
            "timestamp": block.timestamp,
            "action": block.action,
            "block_hash": block.block_hash,
            "previous_hash": block.previous_hash,
            "reason": block.reason
        }

    return {
        "case": {
            "case_id": case.case_id,
            "severity": case.severity,
            "status": case.status,
            "exception_code": case.exception_code,
            "expected_paisa": case.expected_paisa,
            "actual_paisa": case.actual_paisa,
            "delta_paisa": case.delta_paisa,
            "explanation": case.explanation,
            "suggested_action": case.suggested_action,
            "opened_at": case.opened_at.isoformat() if case.opened_at else None,
            "resolved_at": case.resolved_at.isoformat() if case.resolved_at else None,
            "resolved_by": case.resolved_by,
            "co_reviewer_email": case.co_reviewer_email
        },
        "file_manifest": file_manifest,
        "audit_proof": audit_proof,
        "vault_metadata": {
            "share_id": context["share_id"],
            "retrieved_at": utc_now().isoformat(),
            "confidentiality_notice": "CONFIDENTIAL AUDIT DOSSIER - FOR REGULATORY REVIEW ONLY"
        }
    }

@router.get("/download/{attachment_id}")
def download_vault_file(
    attachment_id: int,
    context: Dict[str, Any] = Depends(get_vault_context),
    session: Session = Depends(get_db)
):
    """
    Streams the raw original evidence file after live SHA-256 verification.
    """
    att = session.exec(
        select(EvidenceAttachment)
        .where(EvidenceAttachment.id == attachment_id)
        .where(EvidenceAttachment.case_id == context["case_id"])
    ).first()

    if not att:
        raise HTTPException(status_code=404, detail="Requested evidence attachment not found.")

    if not os.path.exists(att.storage_path):
        raise HTTPException(status_code=404, detail="Evidence file not found on disk.")

    with open(att.storage_path, "rb") as f:
        file_bytes = f.read()

    # Live SHA-256 Integrity Verification
    live_sha256 = hashlib.sha256(file_bytes).hexdigest()
    if live_sha256.lower() != att.file_sha256.lower():
        raise HTTPException(
            status_code=500,
            detail="Cryptographic Integrity Error: File content does not match the immutable hash registered in the audit ledger."
        )

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
    # Task 0.1: Log evidence access to chain
    append_to_chain(
        session=session,
        case_id=context["case_id"],
        reviewer=context.get("created_by", "AUDITOR"),
        action="EVIDENCE_RETRIEVED",
        reason=f"Evidence file {att.filename} downloaded via secure vault link",
        payload_snapshot={
            "case_id": context["case_id"],
            "resource_type": "ATTACHED_FILE",
            "attachment_id": att.id,
            "files_accessed": [att.filename],
            "file_sha256": att.file_sha256,
            "share_id": context["share_id"],
            "reviewer": context.get("created_by", "AUDITOR"),
            "timestamp": utc_now().isoformat()
        }
    )
    session.commit()

    media_type = media_types.get(att.file_type.upper(), "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{att.filename}"'}
    )

@router.get("/executive-pdf")
def download_vault_executive_pdf(
    context: Dict[str, Any] = Depends(get_vault_context),
    session: Session = Depends(get_db)
):
    """
    Streams official Executive Evidence Pack PDF.
    """
    case = session.exec(select(ReconciliationCase).where(ReconciliationCase.case_id == context["case_id"])).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case record not found.")

    pdf_buffer = generate_evidence_pack_pdf(case, session=session)
    filename = f"LedgerLens_Executive_Evidence_Pack_{context['case_id']}.pdf"

    # Task 0.1: Log evidence access to chain
    append_to_chain(
        session=session,
        case_id=context["case_id"],
        reviewer=context.get("created_by", "AUDITOR"),
        action="EVIDENCE_RETRIEVED",
        reason="Executive Evidence Pack PDF downloaded via secure vault link",
        payload_snapshot={
            "case_id": context["case_id"],
            "resource_type": "EVIDENCE_PACK_PDF",
            "files_accessed": [filename],
            "share_id": context["share_id"],
            "reviewer": context.get("created_by", "AUDITOR"),
            "timestamp": utc_now().isoformat()
        }
    )
    session.commit()

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/revoke/{share_id}")
def revoke_vault_link(
    share_id: str,
    current_reviewer: Reviewer = Depends(get_current_reviewer),
    session: Session = Depends(get_db)
):
    """
    Admin revokes an active link immediately.
    """
    if current_reviewer.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Only Admins can revoke auditor access links.")

    link = session.exec(select(AuditShareLink).where(AuditShareLink.share_id == share_id)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found.")

    link.is_revoked = True
    session.add(link)
    session.commit()

    append_to_chain(
        session=session,
        case_id=link.case_id,
        reviewer=current_reviewer.email,
        action="AUDIT_SHARE_LINK_REVOKED",
        reason=f"Admin revoked auditor access link. Share ID: {share_id}",
        payload_snapshot={"share_id": share_id, "case_id": link.case_id}
    )
    session.commit()

    return {"message": "Auditor access link revoked successfully.", "share_id": share_id}
