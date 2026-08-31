# LedgerLens Guard - Risk Register

| ID | Status | Description | Remediation |
|---|---|---|---|
| C1 | Fixed | Reviewer "reason" stored XSS / PDF injection | Used `html.escape` to sanitize reviewer reason prior to DB storage, and escaped `explanation` and `suggested_action` in `pdf_generator.py` before passing to ReportLab `Paragraph`. |
| B4 | Fixed | Demo credentials shown in login UI | Gated demo credentials display in `Login.tsx` behind the `import.meta.env.VITE_DEMO_MODE === 'true'` environment variable. |
| B1 | Fixed | JWT stored in localStorage | Moved JWT to an `httpOnly`, `Secure`, `SameSite=Strict` cookie in FastAPI. Removed local storage persistence from frontend `auth.ts`. |
| C3 | Fixed | No CSP / CSRF protection | Added `X-CSRF-Protection` header requirement on all mutating endpoints. Added `SecurityHeadersMiddleware` with strict `Content-Security-Policy`. |
| G1 | Fixed | No webhook replay/idempotency protection | Added `ProcessedWebhook` table to store processed event IDs. Implemented 5-minute timestamp freshness check and duplicate event ID rejection to prevent replay attacks and double-processing. |
| B3 | Fixed | No RBAC beyond a single "reviewer" role | Added explicit Role Enum (REVIEWER, SENIOR_APPROVER, AUDITOR, ADMIN) to DB schema. Added server-side `RequireRole` dependency in `auth.py`. Enforced read-only roles on `GET` routes and write-capable roles on `POST/PUT/DELETE` routes. |
| A1 | Fixed | Reconciliation recompute can silently discard reviewer decisions | Split matching from lifecycle. Cases now use a deterministic hash key `(code, settlement_id, payment_id, utr)`. Upsert logic preserves human decisions unless underlying facts (amount/delta) change, in which case it reopens and logs `CASE_RECOMPUTED` to the audit chain. |
