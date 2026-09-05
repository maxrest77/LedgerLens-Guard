import { useEffect, useState, useRef } from 'react'
import { Card, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table'
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'
import { 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  Users, 
  Layers, 
  BarChart3, 
  Lock, 
  FileCheck2, 
  IndianRupee,
  Sparkles,
  Clock,
  Zap,
  Activity,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react'

interface ExposureSummary {
  scope: string
  exposure: {
    total_unresolved_cases: number
    total_exposure_paisa: number
    total_exposure_inr: number
    severity_breakdown: Record<string, { count: number; total_delta_paisa: number; total_delta_inr: number }>
  }
  compliance: {
    dpdp_erasure_requests_processed: number
    dpdp_law: string
    pii_pseudonymization_status: string
  }
  chain_status: {
    is_valid: boolean
    status: string
    block_count: number
    verification_uptime_pct: number
    latest_anchor_status: string
    last_anchor_url: string | null
  }
}

interface TrendSeriesItem {
  bucket: string
  total_cases: number
  resolved_cases: number
  open_cases: number
  health_rate: number
  unresolved_delta_paisa: number
  unresolved_delta_inr: number
}

interface TrendsData {
  period: string
  range: string
  scoped_portfolio: string | null
  total_exceptions: number
  overall_health_rate: number
  series: TrendSeriesItem[]
}

interface PortfolioItem {
  portfolio_id: string
  open_case_count: number
  total_case_count: number
  resolved_case_count: number
  health_rate: number
  unresolved_delta_paisa: number
  unresolved_delta_inr: number
  oldest_open_case_age_days: number
  oldest_open_case_id: string | null
}

interface FeeBreakdownItem {
  exception_code: string
  case_count: number
  total_delta_paisa: number
  total_delta_inr: number
  unresolved_delta_paisa: number
  unresolved_delta_inr: number
  resolved_delta_paisa: number
  resolved_delta_inr: number
}

interface FeeImpactData {
  range: string
  total_leakage_paisa: number
  total_leakage_inr: number
  total_cases_analyzed: number
  breakdown: FeeBreakdownItem[]
}

interface ReviewerStats {
  reviewer_email: string
  role: string
  portfolio_id: string
  cases_resolved: number
  approved_count: number
  rejected_count: number
  approval_ratio: number
  rejection_ratio: number
  avg_time_to_decision_hours: number
  flagged_reasons_count: number
  flag_rate: number
}

// ── Phase 5 Interfaces ────────────────────────────────────────────────────────
interface NearMissPattern {
  explanation_pattern: string
  share_pct: number
  case_count: number
  avg_confidence_score: number
  aggregate_delta_paisa: number
  aggregate_delta_inr: number
}

interface NearMissData {
  widget_type: string
  is_deterministic: boolean
  disclaimer: string
  range: string
  portfolio_scope: string
  total_cases_analyzed: number
  total_near_misses: number
  near_miss_rate_pct: number
  patterns: NearMissPattern[]
}

interface SettlementNowcastData {
  widget_type: string
  is_deterministic: boolean
  disclaimer: string
  portfolio_scope: string
  trending_late_count: number
  at_risk_paisa: number
  at_risk_inr: number
  baseline_tat_days: number
  projected_slippage_days: number
  probability_pct: number
  confidence_band: string
  model_signals: string[]
}

interface RiskCoOccurrence {
  pair: string
  signal_a: string
  signal_b: string
  count: number
  co_occurrence_pct: number
}

interface RiskCorrelationData {
  widget_type: string
  is_deterministic: boolean
  disclaimer: string
  rule_i1_standard: string
  portfolio_scope: string
  total_cases_analyzed: number
  multi_signal_flagged_cases: number
  signal_breakdown: Record<string, { label: string; count: number; share_pct: number }>
  co_occurrences: RiskCoOccurrence[]
}

export default function InternalAnalytics() {
  const { reviewer } = useAuthStore()
  const [initialLoading, setInitialLoading] = useState(true)
  const [trendsUpdating, setTrendsUpdating] = useState(false)
  
  // Phase 1 - 3 Data states
  const [summary, setSummary] = useState<ExposureSummary | null>(null)
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([])
  const [feeImpact, setFeeImpact] = useState<FeeImpactData | null>(null)
  const [teamStats, setTeamStats] = useState<ReviewerStats[]>([])

  // Phase 5 Predictive Intelligence States
  const [nearMisses, setNearMisses] = useState<NearMissData | null>(null)
  const [nowcast, setNowcast] = useState<SettlementNowcastData | null>(null)
  const [riskCorrelations, setRiskCorrelations] = useState<RiskCorrelationData | null>(null)

  // Filter controls
  const [trendPeriod, setTrendPeriod] = useState('weekly')
  const [trendRange, setTrendRange] = useState('90d')
  const [portfolioSort, setPortfolioSort] = useState<'worst_health' | 'oldest_case' | 'highest_delta'>('worst_health')

  const userRole = reviewer?.role?.toUpperCase() || ''
  const isAuthorized = ['ADMIN', 'REVIEWER'].includes(userRole)

  // Initial Full Dashboard Fetch
  useEffect(() => {
    if (!isAuthorized) {
      setInitialLoading(false)
      return
    }

    const fetchAllData = async () => {
      setInitialLoading(true)
      try {
        const results = await Promise.allSettled([
          api.get('/api/analytics/internal/summary'),
          api.get(`/api/analytics/internal/trends?period=${trendPeriod}&range=${trendRange}`),
          api.get('/api/analytics/internal/portfolios'),
          api.get(`/api/analytics/internal/fee-impact?range=${trendRange}`),
          api.get('/api/analytics/internal/team'),
          api.get(`/api/analytics/predictive/near-misses?range=${trendRange}`),
          api.get('/api/analytics/predictive/settlement-nowcast'),
          api.get('/api/analytics/predictive/risk-correlations')
        ])

        if (results[0].status === 'fulfilled') setSummary(results[0].value.data)
        if (results[1].status === 'fulfilled') setTrends(results[1].value.data)
        if (results[2].status === 'fulfilled') setPortfolios(results[2].value.data.portfolios || [])
        if (results[3].status === 'fulfilled') setFeeImpact(results[3].value.data)
        if (results[4].status === 'fulfilled') setTeamStats(results[4].value.data.reviewers || [])
        if (results[5].status === 'fulfilled') setNearMisses(results[5].value.data)
        if (results[6].status === 'fulfilled') setNowcast(results[6].value.data)
        if (results[7].status === 'fulfilled') setRiskCorrelations(results[7].value.data)
      } catch (err) {
        console.error('Failed to load internal analytics data', err)
      } finally {
        setInitialLoading(false)
      }
    }

    fetchAllData()
  }, [isAuthorized])

  // In-Place Smooth Filter Update (Never unmounts dashboard or flashes skeleton cards)
  const isFirstMount = useRef(true)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    if (!isAuthorized || initialLoading) return

    const updateFilterData = async () => {
      setTrendsUpdating(true)
      try {
        const [trendsRes, feeRes, nearMissRes] = await Promise.allSettled([
          api.get(`/api/analytics/internal/trends?period=${trendPeriod}&range=${trendRange}`),
          api.get(`/api/analytics/internal/fee-impact?range=${trendRange}`),
          api.get(`/api/analytics/predictive/near-misses?range=${trendRange}`)
        ])

        if (trendsRes.status === 'fulfilled') setTrends(trendsRes.value.data)
        if (feeRes.status === 'fulfilled') setFeeImpact(feeRes.value.data)
        if (nearMissRes.status === 'fulfilled') setNearMisses(nearMissRes.value.data)
      } catch (err) {
        console.error('Failed to update filtered trends', err)
      } finally {
        setTrendsUpdating(false)
      }
    }

    updateFilterData()
  }, [trendPeriod, trendRange])

  // Sorting portfolios
  const sortedPortfolios = [...portfolios].sort((a, b) => {
    if (portfolioSort === 'worst_health') {
      return a.health_rate - b.health_rate
    } else if (portfolioSort === 'oldest_case') {
      return b.oldest_open_case_age_days - a.oldest_open_case_age_days
    } else {
      return b.unresolved_delta_paisa - a.unresolved_delta_paisa
    }
  })

  // 403 Forbidden State
  if (!isAuthorized) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-white/60 backdrop-blur-xl border border-rose-200/80 shadow-lg rounded-2xl p-8 text-center relative overflow-hidden">
          <div className="h-16 w-16 mx-auto rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-4 shadow-inner">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Access Restricted (403)</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Company Internal Analytics is strictly restricted to authenticated <span className="font-semibold text-slate-800">Administrators</span> and assigned <span className="font-semibold text-slate-800">Reviewers</span>.
          </p>
          <div className="mt-6 pt-4 border-t border-slate-200/60 text-xs text-slate-400 font-mono">
            Role: {reviewer?.role || 'UNAUTHENTICATED'} | Tenant IDOR Protection Active
          </div>
        </Card>
      </div>
    )
  }

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200/50 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/50 rounded-2xl animate-pulse"></div>
          ))}
        </div>
        <div className="h-72 bg-slate-200/50 rounded-2xl animate-pulse"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 border-b border-slate-200/60 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-[11px] tracking-wider uppercase">
              Executive Financial Cockpit
            </Badge>
            <span className="text-xs font-mono text-slate-500">
              Scope: {userRole === 'ADMIN' ? 'Organization (All Portfolios)' : `Portfolio ${reviewer?.portfolio_id || 'GLOBAL'}`}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            Company Internal Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 font-medium">
            Financial exposure risk, predictive nowcasts, near-miss pattern telemetry, and multi-signal risk correlation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'REVIEWER' && (
            <Badge variant="warning" className="bg-amber-100 text-amber-800 border-amber-300 font-bold px-3 py-1">
              Portfolio Scoped: {reviewer?.portfolio_id || 'GLOBAL'}
            </Badge>
          )}
          {userRole === 'ADMIN' && (
            <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold px-3 py-1">
              ADMIN • Full Organization View
            </Badge>
          )}
        </div>
      </div>

      {/* Task 3.5: Financial Exposure & Compliance Summary Tile */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">At-Risk Exposure</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-600 mt-2">
                ₹{summary.exposure.total_exposure_inr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[10px] font-mono font-bold bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                  Crit: ₹{(summary.exposure.severity_breakdown?.CRITICAL?.total_delta_inr ?? 0).toLocaleString()} ({summary.exposure.severity_breakdown?.CRITICAL?.count ?? 0})
                </span>
                <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  High: ₹{(summary.exposure.severity_breakdown?.HIGH?.total_delta_inr ?? 0).toLocaleString()} ({summary.exposure.severity_breakdown?.HIGH?.count ?? 0})
                </span>
              </div>
            </div>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chain Integrity</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-black text-emerald-600">
                  {summary.chain_status.is_valid ? '100% Valid' : 'Degraded'}
                </span>
                <Badge variant="success" className="bg-emerald-100 text-emerald-800 text-[10px] font-mono">
                  {summary.chain_status.verification_uptime_pct}% Uptime
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {summary.chain_status.block_count} SHA-256 blocks anchored with OTS & GitHub Gist.
              </p>
            </div>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">DPDP Compliance</span>
                <FileCheck2 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-blue-600 mt-2">
                {summary.compliance.dpdp_erasure_requests_processed}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Section 12 erasure requests processed. PII pseudonymization: <span className="font-bold text-emerald-600">{summary.compliance.pii_pseudonymization_status}</span>.
              </p>
            </div>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Operational Scope</span>
                <Layers className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-xl font-black text-purple-700 mt-2 truncate">
                {summary.scope === 'COMPANY_WIDE' ? 'Company-Wide' : summary.scope}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {summary.exposure.total_unresolved_cases} active open discrepancies requiring triage.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── PREDICTIVE & PATTERN INTELLIGENCE SUITE ────────────────── */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-200/60">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Predictive Risk & Anomaly Intelligence
          </h2>
          <Badge variant="outline" className="text-[10px] font-mono bg-purple-50 text-purple-700 border-purple-200">
            Probabilistic Telemetry
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pattern Intelligence */}
          <Card className={`bg-white/40 backdrop-blur-xl shadow-sm border border-indigo-200/70 rounded-2xl overflow-hidden relative flex flex-col transition-opacity duration-200 ${trendsUpdating ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className="p-5 space-y-3 flex-1 flex flex-col">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <Badge variant="outline" className="text-[9px] font-mono bg-indigo-50 text-indigo-700 border-indigo-200 uppercase">
                    Pattern Share Telemetry
                  </Badge>
                  <CardTitle className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-indigo-600" />
                    Near-Miss Explanation Shares
                  </CardTitle>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-indigo-700 font-mono">
                    {nearMisses?.total_near_misses || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    ({nearMisses?.near_miss_rate_pct || 0}% of volume)
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[260px] pr-1">
                {nearMisses?.patterns?.map((pat) => (
                  <div key={pat.explanation_pattern} className="p-2.5 rounded-xl bg-white/70 border border-slate-200/60">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate" title={pat.explanation_pattern}>
                        {pat.explanation_pattern}
                      </span>
                      <span className="font-bold text-indigo-600 font-mono shrink-0 ml-2">
                        {pat.share_pct}%
                      </span>
                    </div>
                    {/* Visual share bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div 
                        className="bg-indigo-600 h-full rounded-full" 
                        style={{ width: `${Math.min(100, pat.share_pct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-1.5">
                      <span>{pat.case_count} cases • Conf {pat.avg_confidence_score}</span>
                      <span className="font-semibold text-slate-700">₹{pat.aggregate_delta_inr.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 font-mono pt-2 border-t border-slate-100 italic">
                Pattern-level aggregate only. Sub-threshold score cases from match_scorer.py.
              </p>
            </div>
          </Card>

          {/* Task 5.2: Settlement Nowcasting Panel */}
          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-amber-200/70 rounded-2xl overflow-hidden relative flex flex-col">
            <div className="p-5 space-y-3 flex-1 flex flex-col">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <Badge variant="outline" className="text-[9px] font-mono bg-amber-50 text-amber-800 border-amber-200 uppercase">
                    Task 5.2 • Probabilistic Estimate
                  </Badge>
                  <CardTitle className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Settlement Nowcasting
                  </CardTitle>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-amber-600 font-mono">
                    {nowcast?.trending_late_count || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Trending Late
                  </span>
                </div>
              </div>

              <div className="space-y-3 flex-1">
                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60">
                  <span className="text-[11px] font-bold text-amber-900 block">Estimated Capital at Latency Risk</span>
                  <div className="text-xl font-black text-amber-700 font-mono mt-0.5">
                    ₹{(nowcast?.at_risk_inr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-amber-700/80 font-mono mt-1 block">
                    Baseline TAT: {nowcast?.baseline_tat_days}d • Projected Slippage: +{nowcast?.projected_slippage_days}d
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Delay Probability</span>
                    <span className="font-mono text-amber-700 font-bold">{nowcast?.probability_pct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full rounded-full transition-all"
                      style={{ width: `${nowcast?.probability_pct || 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {nowcast?.confidence_band}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 space-y-1">
                  <span className="font-bold text-[10px] uppercase text-slate-400 block">Model Telemetry Signals:</span>
                  {nowcast?.model_signals?.map((sig, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span>{sig}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-slate-400 font-mono pt-2 border-t border-slate-100 italic">
                Probabilistic nowcast estimate. Does not replace deterministic exception matching.
              </p>
            </div>
          </Card>

          {/* Risk Signal Correlation View */}
          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-purple-200/70 rounded-2xl overflow-hidden relative flex flex-col">
            <div className="p-5 space-y-3 flex-1 flex flex-col">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <Badge variant="outline" className="text-[9px] font-mono bg-purple-50 text-purple-700 border-purple-200 uppercase">
                    Rule Correlation Matrix
                  </Badge>
                  <CardTitle className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-purple-600" />
                    Multi-Signal Co-Occurrence
                  </CardTitle>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-purple-700 font-mono">
                    {riskCorrelations?.multi_signal_flagged_cases || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    2+ Signals Flagged
                  </span>
                </div>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[260px] pr-1">
                {riskCorrelations?.co_occurrences?.map((co) => (
                  <div key={co.pair} className="p-2.5 rounded-xl bg-white/70 border border-slate-200/60">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 text-[11px] truncate" title={co.pair}>
                        {co.pair}
                      </span>
                      <span className="font-bold text-purple-700 font-mono shrink-0 ml-2">
                        {co.count} cases
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div 
                        className="bg-purple-600 h-full rounded-full" 
                        style={{ width: `${Math.min(100, co.co_occurrence_pct * 2)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-1">
                      <span>Co-occurrence rate</span>
                      <span className="font-bold text-purple-600">{co.co_occurrence_pct}%</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 font-mono pt-2 border-t border-slate-100 italic">
                Rule I1: Co-occurrence of velocity, refund anomaly, & IP clustering (z &gt; 2.5).
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Trend charts (Health rate and exception volume over time) */}
      <Card className={`bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative transition-opacity duration-200 ${trendsUpdating ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/40 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                Resolution Trajectory & Volume Trends
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Time-bucketed resolution trajectory and unsettled delta exposure over historical intervals.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Segmented Period Switcher */}
              <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-inner gap-0.5">
                {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTrendPeriod(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                      trendPeriod === p
                        ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Styled Range Dropdown */}
              <div className="relative inline-flex items-center">
                <select
                  value={trendRange}
                  onChange={(e) => setTrendRange(e.target.value)}
                  className="h-8 pl-3 pr-8 rounded-xl border border-slate-200/80 bg-white text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                >
                  <option value="30d">Last 30 Days</option>
                  <option value="60d">Last 60 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="180d">Last 180 Days</option>
                  <option value="1y">Last 1 Year</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
              </div>
            </div>
          </div>

          {(() => {
            const chartSeries = (trends?.series || []).map((s: any) => ({
              ...s,
              bucket: s.bucket || s.period_label || s.period || 'Current',
              period_label: s.period_label || s.bucket || s.period || 'Current',
              total_cases: s.total_cases ?? s.exception_volume ?? 0,
              resolved_cases: s.resolved_cases ?? s.resolved_count ?? 0,
              open_cases: s.open_cases ?? s.unresolved_count ?? 0,
              health_rate: s.health_rate ?? s.match_rate ?? 0,
            }))

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Discrepancy Volume by Period
                  </h4>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} tickMargin={8} />
                        <YAxis stroke="#64748b" fontSize={11} tickMargin={8} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f1f5f9' }}
                        />
                        <Legend />
                        <Bar dataKey="total_cases" name="Total Logged" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
                        <Bar dataKey="resolved_cases" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                        <Bar dataKey="open_cases" name="Unresolved" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Match / Health Rate Trajectory (%)
                  </h4>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} tickMargin={8} />
                        <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} tickMargin={8} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="health_rate" name="Health Rate %" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </Card>

      {/* Portfolio Operational Leaderboard */}
      <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/40 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-600" />
                Portfolio Operational Leaderboard
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Surfacing business units with the oldest unresolved discrepancies or lowest health rate first.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                Sort:
              </span>
              <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-inner gap-0.5">
                <button
                  type="button"
                  onClick={() => setPortfolioSort('worst_health')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    portfolioSort === 'worst_health'
                      ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  Worst Health First
                </button>
                <button
                  type="button"
                  onClick={() => setPortfolioSort('oldest_case')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    portfolioSort === 'oldest_case'
                      ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  Oldest Dispute
                </button>
                <button
                  type="button"
                  onClick={() => setPortfolioSort('highest_delta')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    portfolioSort === 'highest_delta'
                      ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  Highest Delta (₹)
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/60">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-slate-200/60">
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Portfolio ID</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Health Rate</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Open Cases</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Total Cases</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-500">Unresolved Exposure</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-500">Oldest Case Age</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-500">Oldest Case ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPortfolios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-400 text-xs">
                      No portfolio breakdown records available for this scope.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPortfolios.map((p) => (
                    <TableRow key={p.portfolio_id} className="border-slate-200/60 hover:bg-white/80 transition-colors">
                      <TableCell className="font-mono font-bold text-xs text-slate-900">{p.portfolio_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-xs ${p.health_rate < 80 ? 'text-rose-600' : p.health_rate < 95 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {p.health_rate}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-rose-600">{p.open_case_count}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{p.total_case_count}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-slate-900">
                        ₹{p.unresolved_delta_inr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-slate-700">
                        {p.oldest_open_case_age_days} days
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-blue-600">
                        {p.oldest_open_case_id || <span className="text-slate-400 italic">None</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      {/* Fee-Leakage Panel */}
      <Card className={`bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative transition-opacity duration-200 ${trendsUpdating ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10 p-6 space-y-4">
          <div className="border-b border-slate-200/40 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-emerald-600" />
              Fee Leakage & Anomaly Impact
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Aggregate financial delta impact grouped by anomaly classification code.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Fee Leakage by Exception Code (₹)
              </h4>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={feeImpact?.breakdown || []} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis 
                      dataKey="exception_code" 
                      stroke="#64748b" 
                      fontSize={10} 
                      textAnchor="end"
                      tickFormatter={(val) => {
                        const str = String(val || '')
                        return str.length > 14 ? str.substring(0, 12) + '...' : str
                      }}
                    />
                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `₹${val}`} />
                    <Tooltip 
                      formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Total Impact']}
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="total_delta_inr" name="Total Impact (₹)" fill="#0284c7" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/60">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="border-slate-200/60">
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Exception Code</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Cases</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-500">Unresolved (₹)</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-500">Total Delta (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeImpact?.breakdown?.slice(0, 6).map((item) => (
                    <TableRow key={item.exception_code} className="border-slate-200/60">
                      <TableCell className="font-mono text-xs font-semibold text-slate-800">{item.exception_code}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{item.case_count}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-rose-600">
                        ₹{item.unresolved_delta_inr.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-slate-900">
                        ₹{item.total_delta_inr.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </Card>

      {/* Team Performance View */}
      <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10 p-6 space-y-4">
          <div className="border-b border-slate-200/40 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              Reviewer Operations & Resolution Logistics
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Workload distribution, throughput velocity, and average resolution time per reviewer (Admin & Senior Approver supervisor view).
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/60">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-slate-200/60">
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Reviewer</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Role / Portfolio</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Cases Resolved</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Approve / Reject Ratio</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Avg Time to Decision</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-wider text-slate-500">D2 Soft-Flag Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-400 text-xs">
                      No reviewer activity records found for this scope.
                    </TableCell>
                  </TableRow>
                ) : (
                  teamStats.map((r) => (
                    <TableRow key={r.reviewer_email} className="border-slate-200/60 hover:bg-white/80 transition-colors">
                      <TableCell className="font-mono text-xs font-bold text-slate-900">{r.reviewer_email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {r.role} • {r.portfolio_id}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-slate-800">{r.cases_resolved}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {r.approval_ratio * 100}% / {r.rejection_ratio * 100}%
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">
                        {r.avg_time_to_decision_hours} hours
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={r.flag_rate > 15 ? 'destructive' : 'outline'} 
                          className="font-mono text-[10px]"
                        >
                          {r.flag_rate}% ({r.flagged_reasons_count} flags)
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    </div>
  )
}
