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
| A2 | Fixed | SQLite write concurrency during high volume | Migrated backend to support PostgreSQL via psycopg2. Refactored append_to_chain to use a session.begin_nested() savepoint with an IntegrityError retry loop for robust concurrency. |
| E3 | Fixed | Lockdown daemon 503 scope too broad | Upgraded daemon to a 2-strike system. Strike 1 applies a case-level lock (403). Strike 2 escalates to a system-wide lock (503). |
| F1 | Fixed | Hardcoded fee table | Converted to a dynamic FeeRule DB table allowing versioned fee lookups based on effective timestamps. |
| F2 | Fixed | Floating point inaccuracy | Implemented precise integer paisa half-up arithmetic mimicking Razorpay exact rounding mechanism. |
| B2 | Fixed | Missing refresh token rotation | Added long-lived refresh tokens stored securely and validated against a DB-backed revocation table RefreshToken. Reduced access token TTL to 15m. |
| H2 | Fixed | Unmitigated brute force on /login | Added RateLimitMiddleware restricting /auth/login to 5 requests per 60 seconds per IP. |
| J1 | Fixed | Unencrypted PII | Applied AES-128 encryption via cryptography.fernet to customer_id and originating_ip adhering to the DPDP Act. |
| C2 | Fixed | Unsafe frontend types (any) | Replaced all useState<any> instances in Workspace, Dashboard, AuditLog, ExceptionDetail with strict Typescript models. |
| A3 | Fixed | Lack of DR/Backups | Authored dr_runbook.md specifying WORM backups, multi-AZ deployment, and PITR RTO/RPO expectations. |
| J2 | Fixed | Non-compliant RBI data localization | Included documentation establishing ap-south-1 data storage parameters adhering strictly to RBI localized boundaries. |
| J3 | Fixed | Ambiguous PCI-DSS scope | Diagrammed payment data flow confirming absence of PAN/CVV, defining scope as SAQ-A. |
| E1 | Fixed | Unaudited custom hash-chain serialization | Overhauled append_to_chain JSON generation to utilize deterministic formatting (sort_keys=True, tight separators) stopping hash drift. |
| D1 | Fixed | Unclear resolution path for CRITICAL | Engineered a Maker-Checker multi-sig workflow for Feature 7. Critical approvals mandate two cryptographically verified distinct signatures (Reviewer + Senior Approver). |
| E2 | Fixed | Chain and data share one mutable store | Created Feature 2. Built an external WORM anchoring daemon (jobs/anchoring.py) linking DB hashes to an immutable external ledger, preventing invisible rewrites. |
| F5 | Fixed | PSP-agnostic federated reconciliation | Updated schema and webhook handlers to support multiple PSPs (Stripe, PayU) and normalized them through the unified reconciliation engine. applied G1 idempotency identically to all. |
| F1 | Fixed | Counterfactual near-miss explanations | Augmented the explanation engine to compute and append non-mutating read-only counterfactual near-miss statements for exceptions. |
| F6 | Fixed | Reviewer behavior & insider-risk monitor | Created read-only analytics over the audit chain to identify statistically suspicious rapid rubber-stamping behaviors for compliance review. |
| F4 | Fixed | Settlement nowcasting | Added probabilistic settlement latency forecast modeling alongside deterministic missing-settlement checks, computed off historical delay patterns. |
| F3 | Fixed | Verified-narrative layer (Optional) | Constructed a CFO-friendly narrative layer generator backed by a strict hard validator that instantly rejects any generated fact (ID/number) not present in the deterministic context. |
