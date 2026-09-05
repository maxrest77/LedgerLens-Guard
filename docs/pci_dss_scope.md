# PCI-DSS Scoping & Architecture Boundaries (SAQ-A Assessment)

## 1. Executive Summary & Compliance Classification
**LedgerLens Guard** operates strictly as an **Out-of-Scope / SAQ-A Merchant Reconciliation Platform** under the **Payment Card Industry Data Security Standard (PCI-DSS v4.0)**. 

The platform does **not** ingest, transmit, process, or store raw Primary Account Numbers (PAN), Sensitive Authentication Data (SAD), CVV2/CVC/CID codes, or card PIN blocks. All consumer payment card interactions occur within PSP-hosted iFrames or secure browser redirect sessions directly with certified PCI-DSS Level 1 Payment Service Providers (e.g., VelocePay, PrismPay, Razorpay, Stripe).

---

## 2. Component Scoping Matrix

| Component | Architecture Role | In-Scope for CDE? | Rationale |
| :--- | :--- | :--- | :--- |
| **Cardholder Checkout** | End-user payment submission | **Out-of-Scope (Merchant)** | Hosted entirely in PSP-controlled iFrame / Elements; card data never touches LedgerLens web servers. |
| **PSP Payment Gateway** | Transaction processing & auth | **In-Scope (PSP CDE)** | PCI-DSS Level 1 Service Provider handling tokenization and card network routing. |
| **Webhook Ingestion** | Real-time settlement notifications | **Out-of-Scope (SAQ-A)** | Ingests only transaction metadata, UTRs, tokenized customer IDs, and paisa integers. |
| **Bank Statement Ingestion** | CAMT.053, MT940, BAI2, XLSX | **Out-of-Scope (SAQ-A)** | Filtered immediately through in-memory Luhn sanitizer (`backend/engine/sanitizer.py`). |
| **Evidence Sanitizer** | In-memory stream parser | **Security Control** | Automatically scrubs and masks any 13-19 digit candidate matching the Luhn algorithm to `XXXX-XXXX-XXXX-NNNN`. |
| **LedgerLens Database** | SQLModel / SQLite / Postgres | **Out-of-Scope (SAQ-A)** | Zero PAN/CVV columns; customer IDs and originating IPs are AES-128 Fernet encrypted per DPDP Act. |
| **WORM Audit Hash Chain** | SHA-256 sequential block chain | **Out-of-Scope (SAQ-A)** | Stores only canonical JSON hashes and pseudonymized reviewer/case identifiers. |

---

## 3. Data Flow & Tokenization Architecture Diagram

```mermaid
flowchart TD
    subgraph Cardholder Environment
        User[Customer Browser / Mobile App]
    end

    subgraph PSP PCI-DSS Level 1 CDE Boundary [PCI-DSS In-Scope CDE]
        PSP_iFrame[PSP Hosted Checkout / Elements]
        PSP_Engine[PSP Gateway Core Processor]
        Card_Networks[Visa / Mastercard / RuPay Networks]
    end

    subgraph LedgerLens Guard Environment [PCI-DSS Out-of-Scope / SAQ-A Boundary]
        Ingest_API[Webhook / Statement Ingestion API]
        Sanitizer[In-Memory Luhn Sanitizer (sanitizer.py)]
        Recon_Engine[Multi-Rail Reconciler Engine]
        DB[(Relational DB: ledgerlens.db)]
        WORM[WORM SHA-256 Audit Chain]
    end

    %% Data Flow
    User -- "1. Submits Cardholder PAN / CVV" --> PSP_iFrame
    PSP_iFrame -- "2. Direct TLS 1.3 Transmission" --> PSP_Engine
    PSP_Engine -- "3. Authorization & Settlement" --> Card_Networks
    PSP_Engine -- "4. Returns Tokenized Payment ID & UTR" --> User

    PSP_Engine -- "5. Settlement Webhook (Token + UTR + Paisa)" --> Ingest_API
    Ingest_API --> Sanitizer
    Sanitizer -- "6. Verifies No Raw PAN (Luhn Mask: XXXX-XXXX-XXXX-1234)" --> Recon_Engine
    Recon_Engine --> DB
    Recon_Engine -- "7. Append Sealed Block" --> WORM
```

---

## 4. Ingestion Sanitization & Defense-in-Depth Layer

Even though raw card numbers are prohibited from ingestion payloads, **LedgerLens Guard** implements an automated runtime failsafe in `backend/engine/sanitizer.py`:

```python
# Luhn Algorithm Verification & Masking (backend/engine/sanitizer.py)
def mask_card_number(val: str) -> str:
    """
    Scans free-text descriptions and account fields in uploaded bank statements.
    If a 13-19 digit string satisfies the Luhn checksum, masks all but the
    last 4 digits (e.g. 'XXXX-XXXX-XXXX-4242') to ensure zero cardholder data
    persists into database records or audit snapshots.
    """
```

### Self-Assessment Questionnaire (SAQ-A) Attestation
- **SAQ-A Eligibility**: The platform entirely outsources all cardholder data functions to PCI-DSS compliant third-party payment gateways.
- **Cardholder Data Storage**: Confirmed zero storage of PAN, CVV, or track data in any database table, cache, log file, or forensic audit snapshot.
- **Audit Logging**: Fully compliant with RBI MD-PA and DPDP Act 2023 without introducing card data exposure risks.
