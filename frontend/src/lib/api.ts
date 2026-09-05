import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '../store/auth'
import {
  DEMO_DASHBOARD_DATA,
  DEMO_CHAIN_STATUS,
  DEMO_EXPOSURE_DATA,
  DEMO_PSP_HEALTH,
  DEMO_ESCALATIONS,
  DEMO_WORKSPACE_CASES,
  DEMO_AUDIT_BLOCKS
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

function getFallbackData(url: string) {
  if (url.includes('/api/dashboard')) return DEMO_DASHBOARD_DATA
  if (url.includes('/api/analytics/chain-status')) return DEMO_CHAIN_STATUS
  if (url.includes('/api/admin/exposure')) return DEMO_EXPOSURE_DATA
  if (url.includes('/api/admin/psp-health')) return { data: DEMO_PSP_HEALTH }
  if (url.includes('/api/admin/escalations')) return { data: DEMO_ESCALATIONS }
  if (url.includes('/api/admin/tolerances')) {
    return {
      data: [
        {
          id: 1,
          parameter_name: "AUTO_RESOLVE_THRESHOLD_PAISA",
          threshold_value: 500,
          status: "ACTIVE",
          effective_from: new Date().toISOString(),
          proposed_by: "system",
          approved_by: "system",
          reason: "Initial seeding"
        }
      ]
    }
  }
  if (url.includes('/api/reconciliation') || url.includes('/api/workspace')) {
    return {
      data: DEMO_WORKSPACE_CASES,
      metrics: {
        total_exceptions: 6,
        active_unresolved_count: 2,
        open_count: 1,
        under_review_count: 1,
        total_unresolved_inr: 4570,
        auto_resolved_count: 1,
        finalized_count: 1
      }
    }
  }
  if (url.includes('/api/audit')) return { data: DEMO_AUDIT_BLOCKS, total: DEMO_AUDIT_BLOCKS.length }
  if (url.includes('/api/exceptions/')) {
    const parts = url.split('/')
    const caseId = parts[parts.length - 1]?.split('?')[0]
    const found = DEMO_WORKSPACE_CASES.find(c => c.case_id === caseId)
    return { data: found || DEMO_WORKSPACE_CASES[0] }
  }
  if (url.includes('/auth/me')) {
    const raw = localStorage.getItem('auth_reviewer')
    if (raw) {
      try { return JSON.parse(raw) } catch { }
    }
    return { email: 'admin@ledgerlens.dev', role: 'ADMIN', portfolio_id: 'ADMIN' }
  }
  return null
}

api.interceptors.response.use(
  (response) => {
    // If response is an HTML page (from Vercel SPA rewrite), provide fallback demo data if applicable
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!doctype html')) {
      const url = response.config?.url || ''
      const fallback = getFallbackData(url)
      if (fallback) {
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
      const fallback = getFallbackData(url)
      if (fallback) {
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
