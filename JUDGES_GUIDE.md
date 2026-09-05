# LedgerLens Guard — Judge & Evaluator Guide

> **Welcome, Evaluator!**  
> LedgerLens Guard is an autonomous 4-way financial reconciliation engine and cryptographic WORM audit trail built for high-throughput multi-gateway fintech operations.  
> This guide provides a **3-Minute Fast Track**, a **5-Minute Golden Path**, and a **Feature Verification Matrix** so you can effortlessly explore and test every capability of the system.

---

## ⚡ 1. Fast Track: Instant Access

### How to Run (If not already running)
- **Backend (FastAPI)**:
  ```bash
  uv run --directory backend uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload
  ```
- **Frontend (React + Vite)**:
  ```bash
  cd frontend
  npm run dev
  ```
- Open your browser at: **`http://localhost:5173`**

### 1-Click Instant Demo Login
On the login screen (`/login`), click either instant demo button:
- **Admin / Controller**: `admin@ledgerlens.dev` / `demo_admin_2024`  
  *(Full controller authority: dual-custody approval queue, tolerance rules, DPDP compliance, executive vault sharing)*
- **Reviewer / Maker**: `reviewer@ledgerlens.dev` / `demo_reviewer_2024`  
  *(Triage operations: anomaly workbench, case preview, resolution proposal, analytics)*

> 💡 **In-App Evaluator Tour**: Once logged in, click the glowing **"Judge's Tour & Guide"** button in the sidebar (or press `?` on your keyboard) to toggle the interactive evaluation tour and 1-click persona switcher from any screen!

---

## 🧭 2. The 5-Minute "Golden Path" Evaluation Tour

Follow these 5 stops to experience the end-to-end autonomous reconciliation lifecycle:

### Stop 1: Deterministic 4-Way Ingestion & Anomaly Workbench
- **Route**: [`/workspace`](http://localhost:5173/workspace)
- **What to look for**:
  - Ingests and normalizes heterogeneous streams across **Razorpay/VelocePay**, **PrismPay**, **ClearSettle**, and **ISO 20022 CAMT.053** bank statements.
  - Matches transactions using **exact integer paisa arithmetic** (preventing floating-point drift: `₹12.00 != ₹11.99999999`).
  - Automatically identifies fee inflation (MDR contract drift), 18% GST tax deduction variance, missing settlement batches, and duplicate bank credits.
- **Action to take**: Click on any case row to inspect the full 4-way match breakdown, counterfactual near-miss diagnosis, and root cause explanation.

---

### Stop 2: Maker-Checker Dual-Custody Failsafe (Four-Eyes Principle)
- **Routes**: [`/my-desk`](http://localhost:5173/my-desk) and [`/approval-queue`](http://localhost:5173/approval-queue)
- **What to look for**:
  - Critical/High-severity anomalies enforce strict dual-custody authorization to prevent single-point fraud or accidental bulk payouts.
  - **Anti-Self-Approval**: A maker cannot approve their own case.
- **Interactive Test**:
  1. Switch to **Reviewer** (`reviewer@ledgerlens.dev`).
  2. Open an open case from **Case Preview** (`/my-desk`), click "Review Exception", enter a mandatory resolution reason (min 15 characters), and click **"Propose Approval"**.
  3. Notice the case status transitions to `PENDING_CO_REVIEW`.
  4. Open the Judge's Guide modal (`?`) and switch to **Admin** (`admin@ledgerlens.dev`).
  5. Go to the **Approval Queue** (`/approval-queue`), see the pending request with full maker narrative, and click **Approve Match**.

---

### Stop 3: Cryptographic WORM Audit Chain & Bitcoin Anchoring
- **Route**: [`/audit`](http://localhost:5173/audit)
- **What to look for**:
  - Every case creation, proposal, rule modification, and resolution writes an immutable WORM (Write Once, Read Many) block.
  - Every block contains `sha256(block_id + prev_hash + data_hash + timestamp)`.
  - Periodic block commitments are anchored to the Bitcoin blockchain via **OpenTimestamps (OTS)** for external tamper proofing.
- **Action to take**: Click **"Verify Chain Integrity"** to execute real-time SHA-256 validation across all blocks.

---

### Stop 4: Fintech Anomaly Treemap & Capital Flow
- **Routes**: [`/insights`](http://localhost:5173/insights) and [`/money-flow`](http://localhost:5173/money-flow)
- **What to look for**:
  - **Proportional Treemap**: Visualizes anomaly distribution (Fee Mismatches, Tax Mismatches, Unmatched Credits, Dropped Refunds) sized dynamically by **Case Volume** or **Financial Impact (₹ INR)** with solid black high-contrast fintech typography.
  - **Seasonal Anomaly Heatmap**: 90-day activity matrix revealing spike patterns.
  - **Money Flow**: Capital tracking from captured customer gross volume → contractual interchange fees → 18% GST tax deduction → net clearinghouse bank credits.
- **Action to take**: Toggle between "By Case Volume" and "By Financial Impact (₹)" in the Treemap to observe dynamic tile re-proportioning.

---

### Stop 5: DPDP Act 2023 Compliance & Sealed Public Vault
- **Route**: [`/compliance`](http://localhost:5173/compliance)
- **What to look for**:
  - **Digital Personal Data Protection (DPDP) Act 2023**: "Right to be Forgotten" cryptographic erasure tool that redacts sensitive PII (customer names, PANs, VPA handles) while preserving the double-entry balance sheet and mathematical reconciliation totals.
  - **External Auditor Vault Sharing**: Generates time-limited, cryptographic tokens for external regulatory auditors (RBI, SEBI, SOX) to inspect sealed transaction packs without platform login credentials (`/vault/access/:token`).
  - **Executive Evidence Pack**: Formats forensic transaction evidence for PDF export or executive printing.

---

## 📊 3. Complete Feature & Route Matrix

| Feature Area | Key Route | Primary Role | What It Demonstrates |
| :--- | :--- | :--- | :--- |
| **Landing Scrollytelling** | `/` & `/story` | Public | Interactive scrollytelling visual walkthrough of the 4-way engine |
| **Command Center** | `/command-center` | Admin | High-level controller exposure, unhedged risk, gateway distribution |
| **Executive Dashboard** | `/dashboard` | Reviewer | Daily operational KPIs, risk signals, portfolio health |
| **Gateway Health & Nowcasting** | `/gateway-health` | Admin | Ingestion latency, gateway success rate, settlement delay nowcasting |
| **Rule & Tolerance Management**| `/rule-management` | Admin | Simulating and proposing dynamic auto-resolve thresholds |
| **Approval Queue** | `/approval-queue` | Admin | Maker-Checker escalation queue for critical exceptions |
| **Case Preview / My Desk** | `/my-desk` | Reviewer / Admin | Scoped exception queue with role-based filters |
| **Internal Analytics** | `/analytics` | Reviewer | Detailed statistical variance, resolution time distributions |
| **Anomaly Treemap & Insights**| `/insights` | Reviewer | Dynamic treemap sizing by volume/INR, 90-day calendar heatmap |
| **Capital Money Flow** | `/money-flow` | Reviewer | Multi-step capital liquidity flow (Gross → MDR → Tax → Net) |
| **Risk Center** | `/risk-center` | Reviewer | Reviewer behavior monitor, anomaly scoring, velocity spikes |
| **DPDP Compliance Center** | `/compliance` | Admin / Auditor | PII erasure, auditor token generation, evidence pack preview |
| **Exception Registry** | `/workspace` | Reviewer | Full searchable/filterable ledger of all matched and open cases |
| **WORM Audit Log** | `/audit` | Reviewer / Admin | Cryptographic SHA-256 hash chain and OTS Bitcoin anchor |
| **Public Vault Token Access** | `/vault/access/:token`| Public / Auditor | Read-only expiring access for statutory audits |

---

## 🧪 4. Automated Verification & Code Quality

You can verify the entire test suite directly from your terminal:

```bash
# 1. Run full backend test suite (50+ unit and integration tests)
uv run --directory backend pytest -v

# 2. Run Bitcoin OpenTimestamps verification
uv run --directory backend python -m backend.scripts.verify_anchor

# 3. Verify frontend production build and TypeScript compilation
cd frontend
npm run build
```

---

## 💡 5. Key Innovations to Highlight in Judging

1. **Exact Integer Paisa Arithmetic**: Solves the real-world fintech nightmare of floating-point IEEE-754 drift where `0.1 + 0.2 != 0.3` can cause reconciliations to fail.
2. **Deterministic Dual-Custody (Four-Eyes)**: Eliminates internal fraud risk by guaranteeing that high-value anomalies cannot be unilaterally settled by a single operator.
3. **Cryptographic Tamper-Evident Ledger**: Bridges enterprise database efficiency (SQLModel/FastAPI) with blockchain-grade auditability (SHA-256 hash chaining + Bitcoin OTS anchoring).
4. **DPDP Act 2023 Compliance**: Mathematical balance continuity survives individual data privacy erasure requests.
5. **Zero-Friction In-App Demo Experience**: Interactive Judge's Tour modal, 1-click persona toggling, and scrollytelling visual architecture.
