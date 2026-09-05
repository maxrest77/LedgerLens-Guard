from enum import Enum
from typing import Optional
from datetime import datetime, date
from backend.utils.time_utils import utc_now
from sqlmodel import SQLModel, Field

# ── Enumerations ────────────────────────────────────────────────────────────

class PaymentMethod(str, Enum):
    UPI = "UPI"
    RUPAY_DEBIT = "RUPAY_DEBIT"
    NET_BANKING = "NET_BANKING"
    CREDIT_CARD = "CREDIT_CARD"
    DEBIT_CARD = "DEBIT_CARD"
    INTERNATIONAL = "INTERNATIONAL"
    EMI = "EMI"

class PaymentStatus(str, Enum):
    CAPTURED = "CAPTURED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"

class AdjustmentType(str, Enum):
    TDS = "TDS"
    TCS = "TCS"
    CHARGEBACK = "CHARGEBACK"
    REVERSAL = "REVERSAL"

class CaseStatus(str, Enum):
    OPEN = "OPEN"
    PENDING_CO_REVIEW = "PENDING_CO_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ESCALATED = "ESCALATED"
    AUTO_RESOLVED = "AUTO_RESOLVED"

# ── Record Types (Source Data) ───────────────────────────────────────────────

class Payment(SQLModel, table=True):
    payment_id: str = Field(primary_key=True)
    order_id: str
    merchant_id: str
    amount_paisa: int
    payment_method: PaymentMethod
    status: PaymentStatus
    captured_at: datetime
    originating_ip: str
    customer_id: str
    bank_code: str
    psp_provider: str = Field(default="VELOCEPAY")

class Refund(SQLModel, table=True):
    refund_id: str = Field(primary_key=True)
    payment_id: str = Field(index=True)
    amount_paisa: int
    status: str
    processed_at: datetime

class Settlement(SQLModel, table=True):
    settlement_id: str = Field(primary_key=True)
    utr: str = Field(index=True)
    gross_paisa: int
    fee_paisa: int
    tax_paisa: int
    net_paisa: int
    settled_at: datetime
    on_hold: bool = False
    psp_provider: str = Field(default="VELOCEPAY")

class SettlementPaymentLink(SQLModel, table=True):
    settlement_id: str = Field(foreign_key="settlement.settlement_id", primary_key=True)
    payment_id: str = Field(foreign_key="payment.payment_id", primary_key=True)

class Adjustment(SQLModel, table=True):
    adjustment_id: str = Field(primary_key=True)
    settlement_id: str = Field(index=True)
    type: AdjustmentType
    amount_paisa: int
    reason: str
    created_at: datetime

class BankEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    utr: str = Field(index=True)
    amount_paisa: int
    value_date: date
    description: str
    bank_reference: str

# ── Case Model (Links exception output → reviewer decision → audit chain) ───

class ReconciliationCase(SQLModel, table=True):
    case_id: str = Field(primary_key=True)
    exception_code: str
    severity: str
    settlement_id: Optional[str] = None
    payment_id: Optional[str] = None
    utr: Optional[str] = None
    expected_paisa: int = Field(default=0)
    actual_paisa: int = Field(default=0)
    delta_paisa: Optional[int] = Field(default=None)
    confidence_score: Optional[float] = Field(default=0.0)
    explanation: Optional[str] = None
    suggested_action: Optional[str] = None
    status: CaseStatus = CaseStatus.OPEN
    opened_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    co_reviewer_email: Optional[str] = None
    audit_block_id: Optional[int] = None
    reason_flagged: bool = Field(default=False)
    flag_reason: Optional[str] = None
    portfolio_id: str = Field(default="GLOBAL")

class Role(str, Enum):
    REVIEWER = "REVIEWER"
    ADMIN = "ADMIN"
    AUDITOR = "AUDITOR"

class Reviewer(SQLModel, table=True):
    email: str = Field(primary_key=True)
    hashed_password: str
    role: Role = Field(default=Role.REVIEWER)
    portfolio_id: str = Field(default="GLOBAL")

class DPDPErasureRecord(SQLModel, table=True):
    erasure_id: str = Field(primary_key=True)
    subject_id: str
    request_date: datetime
    completed_date: datetime
    blocks_pseudonym_verified_count: int = Field(default=0)
    dpdp_section_reference: str = Field(default="Section 12(1) — Right to Erasure, DPDP Act 2023")
    verification_status: str = Field(default="VERIFIED")

    @property
    def blocks_rewritten_count(self) -> int:
        return self.blocks_pseudonym_verified_count

class ProcessedWebhook(SQLModel, table=True):
    event_id: str = Field(primary_key=True)
    processed_at: datetime

class IdempotencyKey(SQLModel, table=True):
    key: str = Field(primary_key=True)
    endpoint: str
    request_hash: str
    response_snapshot: str
    status_code: int
    created_at: datetime = Field(default_factory=utc_now)

class FeeRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    method: PaymentMethod
    effective_from: datetime
    effective_to: Optional[datetime] = None
    pct_basis_points: int
    flat_cap_paisa: Optional[int] = None
    threshold_paisa: Optional[int] = None
    pct_below_threshold: Optional[int] = None

class RefreshToken(SQLModel, table=True):
    token: str = Field(primary_key=True)
    reviewer_email: str = Field(foreign_key="reviewer.email")
    expires_at: datetime
    revoked: bool = False

# ── Control Plane Entities ───────────────────────────────────────────────────

class ToleranceRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    parameter_name: str = Field(index=True)
    threshold_value: int
    status: str = Field(default="DRAFT")  # DRAFT, ACTIVE, ARCHIVED
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    proposed_by: str
    approved_by: Optional[str] = None
    reason: Optional[str] = None

class Incident(SQLModel, table=True):
    incident_id: str = Field(primary_key=True)
    severity: str
    status: str = Field(default="INVESTIGATING")
    affected_psp: Optional[str] = None
    impact_paisa: int = Field(default=0)
    started_at: datetime = Field(default_factory=utc_now)
    resolved_at: Optional[datetime] = None
    owner: Optional[str] = None

class ApprovalRequest(SQLModel, table=True):
    request_id: Optional[int] = Field(default=None, primary_key=True)
    case_id: str = Field(foreign_key="reconciliationcase.case_id")
    maker_id: str
    checker_id: Optional[str] = None
    proposed_action: str
    status: str = Field(default="PENDING")  # PENDING, APPROVED, REJECTED
    reason: str
    created_at: datetime = Field(default_factory=utc_now)
    resolved_at: Optional[datetime] = None
    reason_flagged: bool = Field(default=False)
    flag_reason: Optional[str] = None

class AuditState(SQLModel, table=True):
    """Single row table to maintain the sequence head lock."""
    id: int = Field(default=1, primary_key=True)
    last_index: int = Field(default=-1)
    last_hash: str = Field(default="0" * 64)

class ChainAnchor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    block_index: int
    chain_hash: str
    ots_proof_blob: Optional[bytes] = None
    gist_url: Optional[str] = None
    status: str = Field(default="PENDING")
    created_at: datetime = Field(default_factory=utc_now)

class EvidenceAttachment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: str = Field(foreign_key="reconciliationcase.case_id", index=True)
    filename: str = Field(index=True)
    file_type: str = Field(index=True)  # CSV, TSV, XLSX, MT940, BAI2, CAMT053, PDF, IMAGE
    file_size_bytes: int
    file_sha256: str = Field(index=True)
    storage_path: str
    extracted_data_json: str = Field(default="[]")  # Sanitized JSON array of extracted records
    raw_metadata_json: str = Field(default="{}")    # Parser metadata
    uploaded_by: str = Field(index=True)
    submitter_role: str = Field(default="REVIEWER", index=True)  # MAKER, CHECKER, ADMIN, REVIEWER
    uploaded_at: datetime = Field(default_factory=utc_now)
    audit_block_id: Optional[int] = Field(default=None)
    is_committed: bool = Field(default=False, index=True)

class AuditShareLink(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    share_id: str = Field(index=True, unique=True)
    case_id: str = Field(foreign_key="reconciliationcase.case_id", index=True)
    token_hash: str = Field(index=True)
    otp_hash: str
    created_by: str
    created_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime
    failed_attempts: int = Field(default=0)
    max_attempts: int = Field(default=3)
    is_revoked: bool = Field(default=False, index=True)
    last_accessed_at: Optional[datetime] = None
    access_count: int = Field(default=0)


