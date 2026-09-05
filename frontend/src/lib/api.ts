import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '../store/auth'
import {
  DEMO_DASHBOARD_DATA,
  DEMO_CHAIN_STATUS,
  DEMO_EXPOSURE_DATA,
  DEMO_PSP_HEALTH_FULL,
  DEMO_ESCALATIONS,
  DEMO_WORKSPACE_CASES,
  DEMO_AUDIT_BLOCKS,
  DEMO_TOLERANCE_RULES,
  DEMO_MY_DESK_DATA,
  DEMO_COMPLIANCE_SUMMARY,
  DEMO_RISK_CORRELATION_DATA,
  DEMO_PORTFOLIO_RADAR,
  DEMO_TREEMAP,
  DEMO_DAILY_ACTIVITY,
  DEMO_BRIDGE,
  DEMO_INTERNAL_SUMMARY,
  DEMO_INTERNAL_TRENDS,
  DEMO_INTERNAL_PORTFOLIOS,
  DEMO_INTERNAL_FEE_IMPACT,
  DEMO_INTERNAL_TEAM,
  DEMO_NEAR_MISSES,
  DEMO_NOWCAST,
  DEMO_RISK_CORRELATIONS,
  getDemoExceptionDetail,
  getDemoExecutivePack
} from './demoData'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
})

api.interceptors.request.use(
  (config) => {
    config.headers['X-CSRF-Protection'] = '1'
    
    // Attach Bearer token if available
    const token = localStorage.getItem('access_token')
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    if (['post', 'put', 'patch'].includes(config.method?.toLowerCase() || '')) {
      config.headers['Idempotency-Key'] = crypto.randomUUID()
    }
    return config
  },
  (error) => Promise.reject(error)
)

function getFallbackData(url: string, config?: any): any {
  // Auth endpoints
  if (url.includes('/auth/me')) {
    const raw = localStorage.getItem('auth_reviewer')
    if (raw) {
      try { return JSON.parse(raw) } catch { }
    }
    return { email: 'admin@ledgerlens.dev', role: 'ADMIN', portfolio_id: 'ADMIN' }
  }
  if (url.includes('/auth/login')) {
    return {
      access_token: `demo_jwt_admin_${Date.now()}`,
      role: 'ADMIN',
      email: 'admin@ledgerlens.dev',
      portfolio_id: 'ADMIN'
    }
  }
  if (url.includes('/auth/refresh')) {
    return { access_token: `demo_refreshed_${Date.now()}` }
  }

  // Exception detail: MUST return { case: ..., evidence: ... }
  if (url.includes('/api/exceptions/')) {
    if (url.includes('/review')) {
      return { message: "Case review recorded in demo mode." }
    }
    if (url.includes('/evidence/upload')) {
      return {
        status: "STAGED",
        attachment_id: 101,
        filename: "demo_evidence_proof.csv",
        file_type: "CSV",
        file_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        uploaded_by: "You",
        submitter_role: "REVIEWER",
        summary: {
          total_records: 1,
          total_amount_paisa: 125000,
          net_amount_paisa: 118000,
          pci_masked_count: 1
        },
        extracted_records: [
          {
            record_index: 1,
            utr: "UTR9812401827",
            amount_paisa: 125000,
            fee_paisa: 5000,
            tax_paisa: 900,
            net_paisa: 119100,
            masked_account_or_pan: "XXXX-XXXX-1234"
          }
        ]
      }
    }
    if (url.includes('/evidence/staged')) {
      return { message: "Staged evidence cleared." }
    }
    if (url.includes('/evidence')) {
      return {
        data: [
          {
            id: 1,
            filename: "sponsor_nodal_settlement_recon.csv",
            file_type: "CSV",
            file_size_bytes: 24576,
            file_sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            uploaded_by: "admin@ledgerlens.dev",
            submitter_role: "ADMIN",
            uploaded_at: new Date(Date.now() - 3600000).toISOString(),
            audit_block_id: 42,
            is_committed: true,
            records_count: 1,
            preview_records: [
              {
                record_index: 1,
                utr: "UTR9812401827",
                amount_paisa: 125000,
                fee_paisa: 2000,
                tax_paisa: 360,
                net_paisa: 122640,
                timestamp: new Date().toISOString(),
                masked_account_or_pan: "XXXX-XXXX-4321"
              }
            ]
          }
        ]
      }
    }
    if (url.includes('/executive-pack')) {
      const cleanUrl = url.split('?')[0]
      const parts = cleanUrl.split('/')
      const packCaseId = parts[parts.length - 2] || 'CASE-PRISM-001'
      return getDemoExecutivePack(packCaseId)
    }
    const cleanUrl = url.split('?')[0]
    const parts = cleanUrl.split('/')
    const caseId = parts[parts.length - 1] || 'CASE-PRISM-001'
    return getDemoExceptionDetail(caseId)
  }

  // Workspace & Reconciliation
  if (url.includes('/api/workspace') || url.includes('/api/reconciliation')) {
    return {
      data: DEMO_WORKSPACE_CASES,
      metrics: {
        total_exceptions: 400,
        active_unresolved_count: 12,
        open_count: 10,
        under_review_count: 2,
        total_unresolved_inr: 14250,
        auto_resolved_count: 388,
        finalized_count: 6
      }
    }
  }

  // Admin & Financial Control Plane
  if (url.includes('/api/admin/exposure')) return DEMO_EXPOSURE_DATA
  if (url.includes('/api/admin/psp-health')) return DEMO_PSP_HEALTH_FULL
  if (url.includes('/api/admin/escalations')) return { data: DEMO_ESCALATIONS }
  if (url.includes('/api/admin/tolerances')) return { data: DEMO_TOLERANCE_RULES }
  if (url.includes('/api/admin/rules/simulate')) {
    return {
      simulated_impact: { affected_cases: 14, auto_resolved: 12, delta_saved_inr: 3450 },
      status: "SIMULATED"
    }
  }
  if (url.includes('/api/admin/rules/propose')) {
    return { message: "Rule proposed successfully", status: "DRAFT" }
  }
  if (url.includes('/api/admin/rules/reset')) {
    return { message: "Rules reset successfully" }
  }

  // Dashboard & Telemetry
  if (url.includes('/api/dashboard')) return DEMO_DASHBOARD_DATA
  if (url.includes('/api/analytics/chain-status')) return DEMO_CHAIN_STATUS

  // Audit Chain
  if (url.includes('/api/audit/verify')) {
    return { is_valid: true, block_count: DEMO_AUDIT_BLOCKS.length, verified_at: new Date().toISOString() }
  }
  if (url.includes('/api/audit')) {
    return { data: DEMO_AUDIT_BLOCKS, total: DEMO_AUDIT_BLOCKS.length }
  }

  // Compliance Center
  if (url.includes('/api/compliance/summary')) return DEMO_COMPLIANCE_SUMMARY
  if (url.includes('/api/compliance/erasure-log')) return { data: [] }
  if (url.includes('/api/compliance/admin-overrides') || url.includes('/api/analytics/admin-overrides')) {
    return { data: [] }
  }
  if (url.includes('/api/analytics/evidence-retrievals')) {
    return { data: [] }
  }
  if (url.includes('/api/compliance/regulatory-package')) {
    return { package_id: "REG-PKG-2026-09", status: "GENERATED", download_url: "#" }
  }

  // Reviewer Desk
  if (url.includes('/api/analytics/my-desk')) return DEMO_MY_DESK_DATA

  // Risk Center
  if (url.includes('/api/analytics/risk-correlation')) return DEMO_RISK_CORRELATION_DATA

  // Insights & Analytics Radar
  if (url.includes('/api/analytics/portfolio-radar')) return DEMO_PORTFOLIO_RADAR
  if (url.includes('/api/analytics/treemap')) return DEMO_TREEMAP
  if (url.includes('/api/analytics/daily-activity')) return DEMO_DAILY_ACTIVITY
  if (url.includes('/api/analytics/bridge')) return DEMO_BRIDGE

  // Internal Analytics & Predictive Modeling
  if (url.includes('/api/analytics/internal/summary')) return DEMO_INTERNAL_SUMMARY
  if (url.includes('/api/analytics/internal/trends')) return DEMO_INTERNAL_TRENDS
  if (url.includes('/api/analytics/internal/portfolios')) return DEMO_INTERNAL_PORTFOLIOS
  if (url.includes('/api/analytics/internal/fee-impact')) return DEMO_INTERNAL_FEE_IMPACT
  if (url.includes('/api/analytics/internal/team')) return DEMO_INTERNAL_TEAM
  if (url.includes('/api/analytics/predictive/near-misses')) return DEMO_NEAR_MISSES
  if (url.includes('/api/analytics/predictive/settlement-nowcast')) return DEMO_NOWCAST
  if (url.includes('/api/analytics/predictive/risk-correlations')) return DEMO_RISK_CORRELATIONS

  // AI Copilot
  if (url.includes('/api/copilot/query')) {
    return {
      answer: "LedgerLens Guard analyzed 400 settlement records. Overall match rate is 98.4% with ₹14,250 in active unresolved exposure. Detected a systematic 0.04% fee drift on PrismPay UPI credit transactions.",
      confidence: 0.95
    }
  }

  // File exports & Evidence PDF
  if (url.includes('/export/') || url.includes('/download')) {
    if (config?.responseType === 'blob') {
      return new Blob(["%PDF-1.4 ... LedgerLens Forensic Evidence Audit Pack ..."], { type: 'application/pdf' })
    }
    return { message: "Export ready." }
  }

  // Vault Share & Public Auditor Access
  if (url.includes('/api/vault/share/generate')) {
    const token = `tok_demo_${Date.now()}`
    return {
      share_id: `SHR-${Date.now().toString().slice(-6)}`,
      access_token: token,
      otp: "849201",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      vault_url: `${window.location.origin}/vault/access/${token}`
    }
  }
  if (url.includes('/api/vault/share/verify')) {
    return {
      verified: true,
      session_token: `sess_demo_${Date.now()}`,
      expires_at: new Date(Date.now() + 3600000).toISOString()
    }
  }
  if (url.includes('/api/vault/share/dossier')) {
    return {
      case: DEMO_WORKSPACE_CASES[0],
      evidence_files: [
        {
          id: 1,
          filename: "audit_dossier_proof.pdf",
          file_type: "PDF",
          file_size_bytes: 49152,
          file_sha256: "b45c276a0846170d10b809a47a1bc7e1634b82d4da2fc60f64c6bcabdd556a",
          uploaded_by: "compliance@ledgerlens.dev",
          uploaded_at: new Date().toISOString()
        }
      ],
      chain_status: DEMO_CHAIN_STATUS
    }
  }
  if (url.includes('/api/vault/share/download') || url.includes('/api/vault/share/executive-pdf')) {
    return new Blob(["%PDF-1.4 ... LedgerLens Cryptographic Sealed Vault Dossier ..."], { type: 'application/pdf' })
  }

  return null
}

api.interceptors.response.use(
  (response) => {
    // If response is an HTML page (from Vercel SPA rewrite), provide fallback demo data if applicable
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!doctype html')) {
      const url = response.config?.url || ''
      const fallback = getFallbackData(url, response.config)
      if (fallback !== null) {
        return { ...response, data: fallback }
      }
    }
    return response
  },
  (error) => {
    const url = error.config?.url || ''
    const isSilentAuth = url.includes('/auth/refresh') || url.includes('/auth/login') || url.includes('/auth/me') || url.includes('/vault/share') || url.includes('/vault/access')

    // If server returned 404, 405 or network connection error (e.g. static Vercel host without backend):
    // Fall back to high-fidelity demo dataset
    const status = error.response?.status
    const isUnreachable = !status || status === 404 || status === 405 || status === 502 || status === 503
    if (isUnreachable) {
      const fallback = getFallbackData(url, error.config)
      if (fallback !== null) {
        return Promise.resolve({
          data: fallback,
          status: 200,
          statusText: 'OK (Demo Fallback)',
          headers: {},
          config: error.config
        } as any)
      }
    }

    if (error.response?.status === 401) {
      if (!isSilentAuth) {
        useAuthStore.getState().logout()
        toast.error('Session expired. Please log in again.')
      }
    } else {
      const msg = error.response?.data?.detail ?? 'An unexpected error occurred.'
      if (!isSilentAuth) {
        toast.error(msg)
      }
    }
    return Promise.reject(error)
  }
)

export default api
