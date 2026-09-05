// Complete High-Fidelity Demo Dataset for LedgerLens Guard Preview & Evaluation

export interface CaseDetail {
  case_id: string
  portfolio_id: string
  exception_code: string
  severity: string
  status: string
  expected_paisa: number
  actual_paisa: number
  delta_paisa: number | null
  confidence_score: number | null
  explanation: string | null
  suggested_action: string | null
  opened_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  utr?: string | null
  payment_id?: string | null
  settlement_id?: string | null
}

export const DEMO_WORKSPACE_CASES: CaseDetail[] = [
  {
    case_id: "CASE-PRISM-001",
    portfolio_id: "PORT_01",
    exception_code: "FEE_MISMATCH",
    severity: "CRITICAL",
    settlement_id: "SET-PRISM-901",
    payment_id: "PAY-IND-8812",
    utr: "UTR9812401827",
    expected_paisa: 125000,
    actual_paisa: 118000,
    delta_paisa: 7000,
    confidence_score: 0.94,
    explanation: "Systematic fee deviation detected: Actual fee exceeds standard contract rate by 7000 paisa.",
    suggested_action: "Escalate to gateway account manager for fee clawback adjustment.",
    status: "PENDING_CO_REVIEW",
    opened_at: new Date(Date.now() - 7200000).toISOString(),
    resolved_at: null,
    resolved_by: "reviewer@ledgerlens.dev"
  },
  {
    case_id: "CASE-CLEAR-002",
    portfolio_id: "PORT_01",
    exception_code: "TIMING_DELAY",
    severity: "HIGH",
    settlement_id: "SET-CLR-302",
    payment_id: "PAY-IND-7711",
    utr: "UTR6521940182",
    expected_paisa: 450000,
    actual_paisa: 450000,
    delta_paisa: 0,
    confidence_score: 0.88,
    explanation: "Settlement window exceeded SLA by 36 hours. Fund settlement delayed at sponsor bank.",
    suggested_action: "Trigger automated sponsor bank inquiry and confirm nodal clearance.",
    status: "OPEN",
    opened_at: new Date(Date.now() - 14400000).toISOString(),
    resolved_at: null,
    resolved_by: null
  },
  {
    case_id: "CASE-RZP-003",
    portfolio_id: "PORT_01",
    exception_code: "AMOUNT_MISMATCH",
    severity: "CRITICAL",
    settlement_id: "SET-RZP-440",
    payment_id: "PAY-IND-3329",
    utr: "UTR1049281726",
    expected_paisa: 890000,
    actual_paisa: 882500,
    delta_paisa: 7500,
    confidence_score: 0.96,
    explanation: "Net settlement payload delta of 7500 paisa against gateway batch manifest.",
    suggested_action: "Request revised batch settlement advisory from payment operations team.",
    status: "PENDING_CO_REVIEW",
    opened_at: new Date(Date.now() - 21600000).toISOString(),
    resolved_at: null,
    resolved_by: "reviewer@ledgerlens.dev"
  },
  {
    case_id: "CASE-AUTO-004",
    portfolio_id: "PORT_01",
    exception_code: "ROUNDING_ERROR",
    severity: "LOW",
    settlement_id: "SET-IND-104",
    payment_id: "PAY-IND-1004",
    utr: "UTR1928374650",
    expected_paisa: 150000,
    actual_paisa: 150240,
    delta_paisa: 240,
    confidence_score: 0.99,
    explanation: "Micro rounding variance of 240 paisa within auto-resolve tolerance threshold (500 paisa).",
    suggested_action: "Auto-settled per active rule R-01.",
    status: "AUTO_RESOLVED",
    opened_at: new Date(Date.now() - 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 86300000).toISOString(),
    resolved_by: "SYSTEM_TOLERANCE_ENGINE"
  },
  {
    case_id: "CASE-MAN-005",
    portfolio_id: "PORT_01",
    exception_code: "MISSING_SETTLEMENT",
    severity: "MEDIUM",
    settlement_id: "SET-IND-205",
    payment_id: "PAY-IND-2005",
    utr: "UTR8273645192",
    expected_paisa: 320000,
    actual_paisa: 0,
    delta_paisa: 320000,
    confidence_score: 0.85,
    explanation: "Payment recorded by customer app, pending gateway settlement dispatch.",
    suggested_action: "Awaiting next batch sweep cycle.",
    status: "OPEN",
    opened_at: new Date(Date.now() - 43200000).toISOString(),
    resolved_at: null,
    resolved_by: null
  },
  {
    case_id: "CASE-RESOLVED-006",
    portfolio_id: "PORT_01",
    exception_code: "FEE_MISMATCH",
    severity: "HIGH",
    settlement_id: "SET-IND-306",
    payment_id: "PAY-IND-3006",
    utr: "UTR9988776655",
    expected_paisa: 210000,
    actual_paisa: 205000,
    delta_paisa: 5000,
    confidence_score: 0.92,
    explanation: "Gateway fee clawback accepted and credited by sponsor bank.",
    suggested_action: "Approved reconciliation adjustment.",
    status: "APPROVED",
    opened_at: new Date(Date.now() - 172800000).toISOString(),
    resolved_at: new Date(Date.now() - 120000000).toISOString(),
    resolved_by: "admin@ledgerlens.dev"
  },
  {
    case_id: "CASE-NULL-FIXTURE-999",
    portfolio_id: "PORT_01",
    exception_code: "CUSTOM_UNKNOWN",
    severity: "MEDIUM",
    settlement_id: null,
    payment_id: null,
    utr: null,
    expected_paisa: 0,
    actual_paisa: 0,
    delta_paisa: null,
    confidence_score: null,
    explanation: null,
    suggested_action: null,
    status: "OPEN",
    opened_at: null,
    resolved_at: null,
    resolved_by: null
  }
]

export function getDemoExceptionDetail(caseId: string) {
  const found = DEMO_WORKSPACE_CASES.find(c => c.case_id === caseId) || DEMO_WORKSPACE_CASES[0]
  if (found.case_id === "CASE-NULL-FIXTURE-999") {
    return {
      case: found,
      evidence: {}
    }
  }
  return {
    case: found,
    evidence: {
      payments: [
        {
          payment_id: found.payment_id || "PAY-IND-8812",
          amount_paisa: found.expected_paisa || 125000,
          captured_at: new Date(Date.now() - 86400000).toISOString(),
          payment_method: "UPI_CREDIT",
          customer_id: "CUST_9912",
          bank_code: "HDFC",
          status: "CAPTURED"
        }
      ],
      settlement: {
        settlement_id: found.settlement_id || "SET-PRISM-901",
        settled_at: new Date(Date.now() - 7200000).toISOString(),
        gross_paisa: (found.expected_paisa || 125000) + 25000,
        fee_paisa: 20000,
        tax_paisa: 5000,
        net_paisa: found.actual_paisa || 118000
      },
      bank_entry: {
        utr: found.utr || "UTR9812401827",
        amount_paisa: found.actual_paisa || 118000,
        value_date: "2026-09-05",
        bank_reference: "REF-BK-91823"
      },
      adjustments: [
        {
          adjustment_id: "ADJ-001",
          type: "FEE_REVERSAL_HOLD",
          amount_paisa: found.delta_paisa || 7000,
          reason: "Fee clawback variance on UPI rail"
        }
      ]
    }
  }
}

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

export const DEMO_PSP_HEALTH_FULL = {
  data: [
    {
      psp_provider: "VELOCEPAY",
      is_synthetic: false,
      match_rate: 99.8,
      total_volume_paisa: 620000000,
      settlements_count: 180,
      payments_count: 185,
      exception_count: 2,
      latency_ms: 124,
      avg_settlement_hours: 14.2,
      uptime_history: [99.9, 100, 99.8, 100, 99.8],
      status: "HEALTHY",
      mdr: {
        expected_rate_pct: 1.85,
        actual_rate_pct: 1.85,
        deviation_pct: 0.0,
        fee_mismatch_count: 0
      },
      trust_score: {
        composite: 98,
        match_rate_score: 99,
        settlement_latency_score: 98,
        fee_accuracy_score: 100,
        anomaly_freedom_score: 99
      },
      match_rate_sparkline: [99.5, 99.7, 99.8, 99.8, 99.8]
    },
    {
      psp_provider: "PRISMPAY",
      is_synthetic: false,
      match_rate: 96.4,
      total_volume_paisa: 310000000,
      settlements_count: 110,
      payments_count: 115,
      exception_count: 8,
      latency_ms: 240,
      avg_settlement_hours: 28.5,
      uptime_history: [98.5, 97.2, 96.8, 96.4, 96.4],
      status: "DEGRADED",
      mdr: {
        expected_rate_pct: 1.85,
        actual_rate_pct: 1.89,
        deviation_pct: 0.04,
        fee_mismatch_count: 8
      },
      trust_score: {
        composite: 88,
        match_rate_score: 91,
        settlement_latency_score: 82,
        fee_accuracy_score: 89,
        anomaly_freedom_score: 90
      },
      match_rate_sparkline: [98.5, 97.2, 96.8, 96.4, 96.4]
    },
    {
      psp_provider: "CLEARSETTLE",
      is_synthetic: false,
      match_rate: 99.1,
      total_volume_paisa: 315000000,
      settlements_count: 110,
      payments_count: 112,
      exception_count: 2,
      latency_ms: 145,
      avg_settlement_hours: 18.0,
      uptime_history: [99.5, 99.2, 99.1, 99.4, 99.1],
      status: "HEALTHY",
      mdr: {
        expected_rate_pct: 1.80,
        actual_rate_pct: 1.80,
        deviation_pct: 0.0,
        fee_mismatch_count: 0
      },
      trust_score: {
        composite: 96,
        match_rate_score: 97,
        settlement_latency_score: 95,
        fee_accuracy_score: 98,
        anomaly_freedom_score: 96
      },
      match_rate_sparkline: [99.0, 99.2, 99.1, 99.3, 99.1]
    }
  ],
  radar_metrics: [
    { metric: "Match Rate", VELOCEPAY: 99, PRISMPAY: 91, CLEARSETTLE: 97 },
    { metric: "Settlement Latency", VELOCEPAY: 98, PRISMPAY: 82, CLEARSETTLE: 95 },
    { metric: "Fee Accuracy", VELOCEPAY: 100, PRISMPAY: 89, CLEARSETTLE: 98 },
    { metric: "Anomaly Freedom", VELOCEPAY: 99, PRISMPAY: 90, CLEARSETTLE: 96 }
  ],
  routing_advisor: {
    has_recommendation: true,
    is_advisory_only: true,
    recommendation: "Shift 15% UPI routing volume from PrismPay to VelocePay to eliminate 0.04% fee drift.",
    leader_psp: "VELOCEPAY",
    benchmark_psp: "PRISMPAY",
    cost_advantage_pct: 1.85,
    exception_reduction_pct: 28.5,
    z_score: 2.1,
    reason: "Consistent fee parity and zero UTR collision rate across VelocePay rail.",
    evaluated_gateways: ["VELOCEPAY", "PRISMPAY", "CLEARSETTLE"],
    total_evaluated_txns: 400
  }
}

export const DEMO_ESCALATIONS = DEMO_WORKSPACE_CASES.filter(
  c => c.status === "PENDING_CO_REVIEW" || c.status === "ESCALATED" || c.severity === "CRITICAL"
)

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

export const DEMO_TOLERANCE_RULES = [
  {
    id: 1,
    parameter_name: "AUTO_RESOLVE_THRESHOLD_PAISA",
    threshold_value: 500,
    status: "ACTIVE",
    effective_from: new Date().toISOString(),
    proposed_by: "system",
    approved_by: "system",
    reason: "Initial seeding baseline rule"
  },
  {
    id: 2,
    parameter_name: "MDR_MAX_VARIANCE_BPS",
    threshold_value: 15,
    status: "ACTIVE",
    effective_from: new Date().toISOString(),
    proposed_by: "admin@ledgerlens.dev",
    approved_by: "admin@ledgerlens.dev",
    reason: "Prevent gateway MDR drift on high-frequency UPI rail"
  }
]

export const DEMO_MY_DESK_DATA = {
  reviewer_email: "reviewer@ledgerlens.dev",
  role: "REVIEWER",
  portfolio_id: "PORT_01",
  assigned_queue: [
    {
      case_id: "CASE-PRISM-001",
      portfolio_id: "PORT_01",
      exception_code: "FEE_MISMATCH",
      severity: "CRITICAL",
      expected_paisa: 125000,
      actual_paisa: 118000,
      delta_paisa: 7000,
      delta_inr: 70,
      opened_at: new Date(Date.now() - 7200000).toISOString(),
      age_hours: 2,
      sla_hours: 12,
      sla_remaining_hours: 10,
      sla_status: "OK",
      confidence_score: 0.94
    },
    {
      case_id: "CASE-CLEAR-002",
      portfolio_id: "PORT_01",
      exception_code: "TIMING_DELAY",
      severity: "HIGH",
      expected_paisa: 450000,
      actual_paisa: 450000,
      delta_paisa: 0,
      delta_inr: 0,
      opened_at: new Date(Date.now() - 14400000).toISOString(),
      age_hours: 4,
      sla_hours: 24,
      sla_remaining_hours: 20,
      sla_status: "OK",
      confidence_score: 0.88
    }
  ],
  pending_actions: [
    {
      case_id: "CASE-PRISM-001",
      portfolio_id: "PORT_01",
      exception_code: "FEE_MISMATCH",
      severity: "CRITICAL",
      status: "PENDING_CO_REVIEW",
      delta_paisa: 7000,
      delta_inr: 70,
      maker_email: "reviewer@ledgerlens.dev",
      opened_at: new Date(Date.now() - 7200000).toISOString(),
      action_type: "CO_SIGN_REQUEST",
      sla_status: "OK"
    }
  ],
  performance: {
    reviewer_email: "reviewer@ledgerlens.dev",
    role: "REVIEWER",
    portfolio_id: "PORT_01",
    cases_resolved: 42,
    approved_count: 38,
    rejected_count: 4,
    approval_ratio: 0.9,
    rejection_ratio: 0.1,
    avg_time_to_decision_hours: 1.8,
    flagged_reasons_count: 1,
    flag_rate: 2.4,
    resolved_this_week: 18,
    resolved_this_month: 42
  },
  portfolio_snapshot: {
    portfolio_id: "PORT_01",
    portfolio_health_rate: 98.4,
    portfolio_open_count: 2,
    portfolio_total_count: 180,
    company_health_rate: 98.4,
    company_open_count: 12,
    company_total_count: 400
  }
}

export const DEMO_COMPLIANCE_SUMMARY = {
  verification_success_rate: 100.0,
  chain_valid: true,
  total_blocks: 420,
  total_erasures: 3,
  total_admin_overrides: 2,
  hosting_region: "ap-south-1",
  ots_confirmed_status: "CONFIRMED",
  daily_uptime_history: [
    { date: "2026-08-30", uptime_pct: 100 },
    { date: "2026-08-31", uptime_pct: 100 },
    { date: "2026-09-01", uptime_pct: 100 },
    { date: "2026-09-02", uptime_pct: 100 },
    { date: "2026-09-03", uptime_pct: 100 },
    { date: "2026-09-04", uptime_pct: 100 },
    { date: "2026-09-05", uptime_pct: 100 }
  ]
}

export const DEMO_RISK_CORRELATION_DATA = {
  timeline_summary: [
    { date: "2026-08-30", total_volume: 120000, anomaly_count: 1, risk_index: 12 },
    { date: "2026-08-31", total_volume: 145000, anomaly_count: 0, risk_index: 8 },
    { date: "2026-09-01", total_volume: 160000, anomaly_count: 2, risk_index: 22 },
    { date: "2026-09-02", total_volume: 155000, anomaly_count: 1, risk_index: 14 },
    { date: "2026-09-03", total_volume: 170000, anomaly_count: 3, risk_index: 35 },
    { date: "2026-09-04", total_volume: 180000, anomaly_count: 2, risk_index: 28 },
    { date: "2026-09-05", total_volume: 195000, anomaly_count: 1, risk_index: 18 }
  ],
  incident_list: [
    {
      incident_id: "INC-2026-09-01",
      severity: "HIGH",
      psp: "PRISMPAY",
      signal: "FEE_DRIFT",
      detected_at: "2026-09-05T08:30:00Z",
      summary: "Systematic fee deviation observed across 8 batch settlements.",
      resolved: false
    }
  ],
  correlations: [
    { factorA: "UPI Rail Load", factorB: "Settlement Latency", correlation: 0.82 },
    { factorA: "Fee Deviation", factorB: "Dispute Rate", correlation: 0.74 }
  ]
}

export const DEMO_PORTFOLIO_RADAR = [
  { dimension: "Throughput", PORT_01: 95, PORT_02: 88, GLOBAL: 92 },
  { dimension: "Accuracy", PORT_01: 99, PORT_02: 96, GLOBAL: 98 },
  { dimension: "SLA Adherence", PORT_01: 98, PORT_02: 94, GLOBAL: 97 },
  { dimension: "Low Risk", PORT_01: 92, PORT_02: 89, GLOBAL: 91 },
  { dimension: "Auto-Match", PORT_01: 97, PORT_02: 95, GLOBAL: 96 }
]

export const DEMO_TREEMAP = [
  { name: "UPI Credit", size: 450000, value: 450000 },
  { name: "NetBanking", size: 320000, value: 320000 },
  { name: "Cards", size: 280000, value: 280000 },
  { name: "Wallets", size: 195000, value: 195000 }
]

export const DEMO_DAILY_ACTIVITY = [
  { date: "2026-09-01", count: 42 },
  { date: "2026-09-02", count: 38 },
  { date: "2026-09-03", count: 55 },
  { date: "2026-09-04", count: 49 },
  { date: "2026-09-05", count: 61 }
]

export const DEMO_BRIDGE = {
  opening_balance: 120000000,
  additions: 45000000,
  deductions: 42500000,
  net_variance: 2500000,
  closing_balance: 122500000
}

export const DEMO_INTERNAL_SUMMARY = {
  total_reconciled_paisa: 1245000000,
  reconciliation_rate: 98.4,
  active_exceptions_count: 12,
  disputed_paisa: 1425000,
  mean_resolution_hours: 2.4,
  team_capacity_pct: 78.5
}

export const DEMO_INTERNAL_TRENDS = [
  { period: "Aug W1", volume: 240000000, match_rate: 98.1, exceptions: 15 },
  { period: "Aug W2", volume: 260000000, match_rate: 98.3, exceptions: 14 },
  { period: "Aug W3", volume: 280000000, match_rate: 98.2, exceptions: 16 },
  { period: "Aug W4", volume: 310000000, match_rate: 98.5, exceptions: 11 },
  { period: "Sep W1", volume: 340000000, match_rate: 98.4, exceptions: 12 }
]

export const DEMO_INTERNAL_PORTFOLIOS = {
  portfolios: [
    { portfolio_id: "PORT_01", name: "Domestic Merchant Rail", health_rate: 98.4, volume_paisa: 620000000, open_cases: 8 },
    { portfolio_id: "PORT_02", name: "Cross-Border Gateway", health_rate: 99.1, volume_paisa: 315000000, open_cases: 2 },
    { portfolio_id: "PORT_03", name: "Corporate Settlements", health_rate: 99.5, volume_paisa: 310000000, open_cases: 2 }
  ]
}

export const DEMO_INTERNAL_FEE_IMPACT = {
  net_leakage_paisa: 28000,
  recovered_paisa: 21000,
  at_risk_paisa: 7000,
  effective_fee_rate: 1.86,
  contract_baseline_rate: 1.85
}

export const DEMO_INTERNAL_TEAM = {
  reviewers: [
    {
      reviewer_email: "reviewer@ledgerlens.dev",
      role: "REVIEWER",
      portfolio_id: "PORT_01",
      cases_resolved: 42,
      approved_count: 38,
      rejected_count: 4,
      approval_ratio: 0.9,
      rejection_ratio: 0.1,
      avg_time_to_decision_hours: 1.8,
      flagged_reasons_count: 1,
      flag_rate: 2.4
    },
    {
      reviewer_email: "admin@ledgerlens.dev",
      role: "ADMIN",
      portfolio_id: "ADMIN",
      cases_resolved: 28,
      approved_count: 26,
      rejected_count: 2,
      approval_ratio: 0.93,
      rejection_ratio: 0.07,
      avg_time_to_decision_hours: 1.2,
      flagged_reasons_count: 0,
      flag_rate: 0.0
    }
  ]
}

export const DEMO_NEAR_MISSES = [
  { case_id: "CASE-AUTO-004", threshold_paisa: 500, delta_paisa: 480, margin_pct: 96, status: "AUTO_RESOLVED" }
]

export const DEMO_NOWCAST = {
  predicted_match_rate: 98.6,
  confidence_interval: [98.2, 99.0],
  expected_exceptions_next_window: 10,
  forecast_horizon_hours: 24
}

export const DEMO_RISK_CORRELATIONS = [
  { metric_x: "Fee Discrepancy", metric_y: "Settlement Delay", r_value: 0.78, p_value: 0.001 }
]

export function getDemoExecutivePack(caseId: string) {
  const found = DEMO_WORKSPACE_CASES.find(c => c.case_id === caseId) || DEMO_WORKSPACE_CASES[0]
  return {
    case: {
      case_id: found.case_id,
      portfolio_id: found.portfolio_id || 'PORT_01',
      exception_code: found.exception_code || 'FEE_MISMATCH',
      severity: found.severity || 'MEDIUM',
      status: found.status || 'OPEN',
      opened_at: found.opened_at || new Date().toISOString(),
      resolved_at: found.resolved_at || null,
      confidence_score: found.confidence_score ?? 0.94,
      explanation: found.explanation || 'Anomaly identified by deterministic rule engine.',
      suggested_action: found.suggested_action || 'Review and verify ledger match.'
    },
    ledger: {
      expected_paisa: found.expected_paisa || 125000,
      actual_paisa: found.actual_paisa || 118000,
      delta_paisa: found.delta_paisa ?? 7000,
      currency: "INR"
    },
    governance: {
      maker: {
        email: found.resolved_by || "reviewer@ledgerlens.dev",
        proposed_action: "APPROVE",
        action: "PROPOSE",
        reason: "Matched against nodal bank credit confirmation.",
        timestamp: found.opened_at || new Date().toISOString()
      },
      checker: found.resolved_at ? {
        email: "admin@ledgerlens.dev",
        action: "APPROVED",
        reason: "Dual-control authorized after secondary statement verification.",
        timestamp: found.resolved_at
      } : null,
      dual_control_enforced: true
    },
    evidence_pack: {
      attached_evidence_files: [
        {
          filename: "settlement_recon_proof.csv",
          file_type: "CSV",
          file_sha256: "8f481e3a67a840fed1112b32b0051e707cf64b82d4da2fc60f64c6bcabdd556a",
          uploaded_by: "admin@ledgerlens.dev",
          submitter_role: "ADMIN",
          uploaded_at: new Date().toISOString(),
          audit_block_id: 42
        }
      ],
      extracted_transactions: [
        {
          record_index: 1,
          utr: found.utr || "UTR9812401827",
          amount_paisa: found.expected_paisa || 125000,
          fee_paisa: 2000,
          tax_paisa: 360,
          net_paisa: found.actual_paisa || 118000,
          timestamp: new Date().toISOString(),
          masked_account_or_pan: "XXXX-XXXX-4321",
          source_file: "settlement_recon_proof.csv",
          submitted_by: "admin@ledgerlens.dev"
        }
      ],
      native_payments: []
    },
    cryptographic_seal: {
      latest_block_index: 42,
      latest_block_hash: "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
      previous_block_hash: "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26e",
      audit_trail: [],
      chain_valid: true,
      generated_at: new Date().toISOString()
    }
  }
}
