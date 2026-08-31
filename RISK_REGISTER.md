# LedgerLens Guard - Risk Register

| ID | Status | Description | Remediation |
|---|---|---|---|
| A1 | Fixed | Reconciliation recompute can silently discard reviewer decisions | Split matching from lifecycle. Cases now use a deterministic hash key `(code, settlement_id, payment_id, utr)`. Upsert logic preserves human decisions unless underlying facts (amount/delta) change, in which case it reopens and logs `CASE_RECOMPUTED` to the audit chain. |
