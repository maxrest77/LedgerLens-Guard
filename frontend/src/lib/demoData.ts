// High-fidelity demo dataset for static Vercel deployment and standalone demo evaluation

export const DEMO_DASHBOARD_DATA = {
  kpis: {
    health_rate: 98.4,
    expected_net_paisa: 1245000000,
    unresolved_delta_paisa: 1425000,
    throughput: "4,200 tx/min",
    total_cases: 400,
    open_cases: 12,
    auto_resolved: 388
  },
  risk_signals: [
    {
      type: "SYSTEMATIC_FEE_DRIFT",
      severity: "HIGH",
      active: true,
      detail: "PrismPay fee multiplier deviation +0.04% over expected baseline on UPI credit flows.",
      date: new Date().toISOString()
    },
    {
      type: "ROUNDING_DISCREPANCY",
      severity: "LOW",
      active: false,
      detail: "Sub-500 paisa micro-deviations detected and auto-settled per Rule R-01.",
      date: new Date(Date.now() - 3600000).toISOString()
    }
  ],
  chart_data: [
    { code: "FEE_MISMATCH", count: 18 },
    { code: "TIMING_DELAY", count: 12 },
    { code: "MISSING_SETTLEMENT", count: 7 },
    { code: "AMOUNT_MISMATCH", count: 4 },
    { code: "DUPLICATE_TX", count: 2 }
  ],
  recent_activity: [
    {
      case_id: "CASE-PRISM-001",
      action: "ESCALATION_CO_REVIEW",
      reviewer: "reviewer@ledgerlens.dev",
      timestamp: new Date(Date.now() - 1200000).toISOString()
    },
    {
      case_id: "CASE-SETTL-042",
      action: "AUTO_RESOLVED",
      reviewer: "Policy Engine (R-01)",
      timestamp: new Date(Date.now() - 2400000).toISOString()
    },
    {
      case_id: "CASE-RZP-109",
      action: "CHECKER_APPROVAL",
      reviewer: "admin@ledgerlens.dev",
      timestamp: new Date(Date.now() - 4800000).toISOString()
    }
  ]
}

export const DEMO_CHAIN_STATUS = {
  block_count: 420,
  is_valid: true,
  last_verified_at: new Date().toISOString(),
  last_confirmed_ots: {
    age_hours: 0.2,
    timestamp: new Date(Date.now() - 720000).toISOString(),
    status: "CONFIRMED_BITCOIN_BLOCK_891240"
  },
  last_gist: {
    url: "https://gist.github.com/maxrest77/ledgerlens-audit-anchor",
    age_hours: 0.5,
    timestamp: new Date(Date.now() - 1800000).toISOString()
  }
}

export const DEMO_EXPOSURE_DATA = {
  total_exposure_paisa: 1425000,
  aging_exposure_paisa: {
    "<4h": 450000,
    "4-12h": 620000,
    "12-24h": 280000,
    ">24h": 75000
  },
  aging_by_severity: {
    "<4h": { CRITICAL: 150000, HIGH: 200000, MEDIUM: 80000, LOW: 20000 },
    "4-12h": { CRITICAL: 220000, HIGH: 250000, MEDIUM: 120000, LOW: 30000 },
    "12-24h": { CRITICAL: 90000, HIGH: 110000, MEDIUM: 60000, LOW: 20000 },
    ">24h": { CRITICAL: 35000, HIGH: 25000, MEDIUM: 10000, LOW: 5000 }
  },
  trends: {
    exposure: [1800000, 1650000, 1500000, 1425000],
    escalations: [15, 12, 10, 8],
    critical: [6, 5, 4, 3],
    exposure_delta_pct: -8.5,
    escalations_delta_pct: -16.7,
    critical_delta_pct: -25.0
  },
  metrics: {
    critical_count: 3,
    escalated_count: 5,
    total_unresolved_count: 12
  }
}

export const DEMO_PSP_HEALTH = [
  {
    psp_provider: "RAZORPAY",
    match_rate: 99.8,
    total_volume_paisa: 620000000,
    settlements_count: 180,
    exception_count: 2,
    latency_ms: 124,
    status: "HEALTHY",
    uptime_history: [99.9, 100, 99.8, 100, 99.8]
  },
  {
    psp_provider: "PRISMPAY",
    match_rate: 96.4,
    total_volume_paisa: 310000000,
    settlements_count: 110,
    exception_count: 8,
    latency_ms: 240,
    status: "DEGRADED",
    uptime_history: [98.5, 97.2, 96.8, 96.4, 96.4]
  },
  {
    psp_provider: "CLEARSETTLE",
    match_rate: 99.1,
    total_volume_paisa: 315000000,
    settlements_count: 110,
    exception_count: 2,
    latency_ms: 145,
    status: "HEALTHY",
    uptime_history: [99.5, 99.2, 99.1, 99.4, 99.1]
  }
]

export const DEMO_ESCALATIONS = [
  {
    case_id: "CASE-PRISM-001",
    exception_code: "FEE_MISMATCH",
    severity: "CRITICAL",
    settlement_id: "SET-PRISM-901",
    payment_id: "PAY-IND-8812",
    utr: "UTR9812401827",
    expected_paisa: 125000,
    actual_paisa: 118000,
    delta_paisa: 7000,
    confidence_score: 94,
    explanation: "Systematic fee deviation detected: Actual fee exceeds standard contract rate by 7000 paisa.",
    suggested_action: "Escalate to gateway account manager for fee clawback adjustment.",
    status: "PENDING_CO_REVIEW",
    opened_at: new Date(Date.now() - 7200000).toISOString()
  },
  {
    case_id: "CASE-CLEAR-002",
    exception_code: "TIMING_DELAY",
    severity: "HIGH",
    settlement_id: "SET-CLR-302",
    payment_id: "PAY-IND-7711",
    utr: "UTR6521940182",
    expected_paisa: 450000,
    actual_paisa: 450000,
    delta_paisa: 0,
    confidence_score: 88,
    explanation: "Settlement window exceeded SLA by 36 hours. Fund settlement delayed at sponsor bank.",
    suggested_action: "Trigger automated sponsor bank inquiry and confirm nodal clearance.",
    status: "OPEN",
    opened_at: new Date(Date.now() - 14400000).toISOString()
  },
  {
    case_id: "CASE-RZP-003",
    exception_code: "AMOUNT_MISMATCH",
    severity: "CRITICAL",
    settlement_id: "SET-RZP-440",
    payment_id: "PAY-IND-3329",
    utr: "UTR1049281726",
    expected_paisa: 890000,
    actual_paisa: 882500,
    delta_paisa: 7500,
    confidence_score: 96,
    explanation: "Net settlement payload delta of 7500 paisa against gateway batch manifest.",
    suggested_action: "Request revised batch settlement advisory from payment operations team.",
    status: "PENDING_CO_REVIEW",
    opened_at: new Date(Date.now() - 21600000).toISOString()
  }
]

export const DEMO_WORKSPACE_CASES = [
  ...DEMO_ESCALATIONS,
  {
    case_id: "CASE-AUTO-004",
    exception_code: "ROUNDING_ERROR",
    severity: "LOW",
    portfolio_id: "PORT_01",
    settlement_id: "SET-IND-104",
    payment_id: "PAY-IND-1004",
    utr: "UTR1928374650",
    expected_paisa: 150000,
    actual_paisa: 150240,
    delta_paisa: 240,
    confidence_score: 99,
    explanation: "Micro rounding variance of 240 paisa within auto-resolve tolerance threshold (500 paisa).",
    suggested_action: "Auto-settled per active rule R-01.",
    status: "AUTO_RESOLVED",
    opened_at: new Date(Date.now() - 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 86300000).toISOString(),
    resolved_by: "SYSTEM_TOLERANCE_ENGINE"
  },
  {
    case_id: "CASE-MAN-005",
    exception_code: "MISSING_SETTLEMENT",
    severity: "MEDIUM",
    portfolio_id: "PORT_01",
    settlement_id: "SET-IND-205",
    payment_id: "PAY-IND-2005",
    utr: "UTR8273645192",
    expected_paisa: 320000,
    actual_paisa: 0,
    delta_paisa: 320000,
    confidence_score: 85,
    explanation: "Payment recorded by customer app, pending gateway settlement dispatch.",
    suggested_action: "Awaiting next batch sweep cycle.",
    status: "OPEN",
    opened_at: new Date(Date.now() - 43200000).toISOString(),
    resolved_at: null,
    resolved_by: null
  },
  {
    case_id: "CASE-RESOLVED-006",
    exception_code: "FEE_MISMATCH",
    severity: "HIGH",
    portfolio_id: "PORT_01",
    settlement_id: "SET-IND-306",
    payment_id: "PAY-IND-3006",
    utr: "UTR9988776655",
    expected_paisa: 210000,
    actual_paisa: 205000,
    delta_paisa: 5000,
    confidence_score: 92,
    explanation: "Gateway fee clawback accepted and credited by sponsor bank.",
    suggested_action: "Approved reconciliation adjustment.",
    status: "APPROVED",
    opened_at: new Date(Date.now() - 172800000).toISOString(),
    resolved_at: new Date(Date.now() - 120000000).toISOString(),
    resolved_by: "admin@ledgerlens.dev"
  }
]

export const DEMO_AUDIT_BLOCKS = [
  {
    index: 0,
    timestamp: "2026-09-01T00:00:00Z",
    action: "GENESIS",
    details: { message: "LedgerLens Guard Genesis Block initialized" },
    prev_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    block_hash: "8f3b17c385a49c490a6e0c7042a98f7e2d9a6b18c0e29b8c2d1b8c7e6f5a4b3c"
  },
  {
    index: 1,
    timestamp: "2026-09-05T08:00:00Z",
    action: "BATCH_RECONCILE",
    details: { total_records: 400, matched: 388, exceptions: 12 },
    prev_hash: "8f3b17c385a49c490a6e0c7042a98f7e2d9a6b18c0e29b8c2d1b8c7e6f5a4b3c",
    block_hash: "a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2"
  },
  {
    index: 2,
    timestamp: "2026-09-05T10:30:00Z",
    action: "MAKER_PROPOSAL",
    details: { case_id: "CASE-PRISM-001", reviewer: "reviewer@ledgerlens.dev", action: "CO_REVIEW_REQUEST" },
    prev_hash: "a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
    block_hash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4"
  }
]
