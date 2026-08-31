# LedgerLens Guard - Risk Register

| ID | Status | Description | Remediation |
|---|---|---|---|
| B3 | Fixed | No RBAC beyond a single "reviewer" role | Added explicit Role Enum (REVIEWER, SENIOR_APPROVER, AUDITOR, ADMIN) to DB schema. Added server-side `RequireRole` dependency in `auth.py`. Enforced read-only roles on `GET` routes and write-capable roles on `POST/PUT/DELETE` routes. |
| A1 | Fixed | Reconciliation recompute can silently discard reviewer decisions | Split matching from lifecycle. Cases now use a deterministic hash key `(code, settlement_id, payment_id, utr)`. Upsert logic preserves human decisions unless underlying facts (amount/delta) change, in which case it reopens and logs `CASE_RECOMPUTED` to the audit chain. |
