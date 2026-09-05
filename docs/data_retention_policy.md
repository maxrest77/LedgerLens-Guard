# DPDP Data Retention & Erasure Policy

## Retention Periods

1. **Financial & Audit Records (Ledger, Settlements, Exceptions, Audit Chain)**
   - Retention Period: `[PENDING_LEGAL_SIGNOFF]` years.
   - Note: The exact statutory retention requirement for financial reconciliation records must be confirmed by the compliance/legal owner. The audit-chain hash and transactional outcome data must remain intact and legally verifiable for this entire duration.

2. **Personally Identifiable Information (PII) & Data Principal Identifiers**
   - Retention Period: Deleted/Anonymized upon explicit Right to Erasure request, or subject to standard DPDP anonymization schedules.
   - PII fields such as Reviewer emails, names, and contact details must be erased/pseudonymized without invalidating the immutable cryptographic properties of the underlying transaction audit trails.

## Erasure Protocol
When an erasure request is executed via the `dpdp_erasure.py` utility:
- Active credentials and refresh tokens are immediately revoked.
- Foreign keys and fields denoting ownership or actions (e.g. `resolved_by`, `proposed_by`, `maker_id`) are irreversibly hashed (SHA-256).
- Audit blocks natively compute hashes of PII rather than storing raw references, meaning DPDP erasure does not violate the immutable audit trail verification (`verify_chain()`).
