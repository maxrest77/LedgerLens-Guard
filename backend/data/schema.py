from enum import Enum
from typing import Optional
from datetime import datetime, date
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

class Refund(SQLModel, table=True):
    refund_id: str = Field(primary_key=True)
    payment_id: str = Field(foreign_key="payment.payment_id")
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

class SettlementPaymentLink(SQLModel, table=True):
    settlement_id: str = Field(foreign_key="settlement.settlement_id", primary_key=True)
    payment_id: str = Field(foreign_key="payment.payment_id", primary_key=True)

class Adjustment(SQLModel, table=True):
    adjustment_id: str = Field(primary_key=True)
    settlement_id: str = Field(foreign_key="settlement.settlement_id")
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
    expected_paisa: int
    actual_paisa: int
    delta_paisa: int
    confidence_score: float
    explanation: str
    suggested_action: str
    status: CaseStatus = CaseStatus.OPEN
    opened_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    audit_block_id: Optional[int] = None

class Role(str, Enum):
    REVIEWER = "REVIEWER"
    SENIOR_APPROVER = "SENIOR_APPROVER"
    AUDITOR = "AUDITOR"
    ADMIN = "ADMIN"

class Reviewer(SQLModel, table=True):
    email: str = Field(primary_key=True)
    hashed_password: str
    role: Role = Field(default=Role.REVIEWER)

class ProcessedWebhook(SQLModel, table=True):
    event_id: str = Field(primary_key=True)
    processed_at: datetime = Field(default_factory=datetime.utcnow)
