import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import { formatDateTime } from '../lib/formatters'
import { getSLABreachStatus } from '../config/sla'
import { useAuthStore } from '../store/auth'
import { 
  Briefcase, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  ArrowRight, 
  TrendingUp, 
  Activity, 
  Building2 
} from 'lucide-react'

interface QueueItem {
  case_id: string
  portfolio_id: string
  exception_code: string
  severity: string
  expected_paisa: number
  actual_paisa: number
  delta_paisa: number
  delta_inr: number
  opened_at: string | null
  age_hours: number
  sla_hours: number
  sla_remaining_hours: number
  sla_status: 'OK' | 'DUE_SOON' | 'BREACHED'
  confidence_score: number
}

interface PerformanceStats {
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
  resolved_this_week: number
  resolved_this_month: number
}

interface PendingActionItem {
  case_id: string
  portfolio_id: string
  exception_code: string
  severity: string
  status: string
  delta_paisa: number
  delta_inr: number
  maker_email: string
  opened_at: string | null
  action_type: 'CO_SIGN_REQUEST' | 'ESCALATED_CASE'
  sla_status: 'OK' | 'DUE_SOON' | 'BREACHED'
}

interface PortfolioSnapshot {
  portfolio_id: string
  portfolio_health_rate: number
  portfolio_open_count: number
  portfolio_total_count: number
  company_health_rate: number
  company_open_count: number
  company_total_count: number
}

interface MyDeskResponse {
  reviewer_email: string
  role: string
  portfolio_id: string
  my_queue: QueueItem[]
  my_performance: PerformanceStats
  pending_my_action: PendingActionItem[]
  portfolio_snapshot: PortfolioSnapshot | null
}

export default function MyDesk() {
  const [data, setData] = useState<MyDeskResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { reviewer } = useAuthStore()

  const isAdmin = (reviewer?.role || data?.role)?.toUpperCase() === 'ADMIN'

  const displayedQueue = useMemo(() => {
    const queue = data?.my_queue || []
    if (isAdmin) {
      return queue.filter((item) => item.severity?.toUpperCase() === 'CRITICAL')
    }
    return queue
  }, [data?.my_queue, isAdmin])

  useEffect(() => {
    fetchDeskData()
  }, [])

  const fetchDeskData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/analytics/my-desk')
      setData(res.data)
    } catch (err) {
      // Interceptor handles error notification
    } finally {
      setLoading(false)
    }
  }

  const getSeverityBadge = (severity: string) => {
    const sev = String(severity || '').toUpperCase()
    if (sev === 'CRITICAL') {
      return <Badge variant="destructive" className="font-mono text-[10px] tracking-wider">CRITICAL</Badge>
    }
    if (sev === 'HIGH') {
      return <Badge variant="warning" className="font-mono text-[10px] tracking-wider">HIGH</Badge>
    }
    if (sev === 'MEDIUM') {
      return <Badge variant="secondary" className="font-mono text-[10px] tracking-wider text-slate-700 bg-slate-200">MEDIUM</Badge>
    }
    return <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-slate-500">LOW</Badge>
  }

  const renderSLABadge = (severity: string, openedAt: string | null) => {
    const sla = getSLABreachStatus(severity, openedAt)
    if (sla.status === 'BREACHED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          <Clock className="w-3 h-3 text-rose-600" />
          {sla.badgeLabel}
        </span>
      )
    }
    if (sla.status === 'DUE_SOON') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          {sla.badgeLabel}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-400" />
        {sla.badgeLabel}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200/50 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-200/50 rounded-2xl animate-pulse"></div>
          ))}
        </div>
        <div className="h-64 bg-slate-200/50 rounded-2xl animate-pulse"></div>
      </div>
    )
  }

  if (!data) return null

  const { my_performance, pending_my_action, portfolio_snapshot } = data

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 border-b border-slate-200/60 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-blue-50 text-blue-700 border border-blue-200 uppercase">
              {data.role}
            </span>
            <span className="text-xs font-mono text-slate-500">Portfolio: {data.portfolio_id || 'GLOBAL'}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">My Desk</h2>
          <p className="text-sm text-slate-500 mt-0.5 font-medium">
            Personal triage queue, resolution velocity, and active review assignments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchDeskData} className="text-xs">
            Refresh Queue
          </Button>
          <Button size="sm" onClick={() => navigate('/workspace')} className="text-xs gap-1">
            Workspace <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Task 2.4 — Portfolio Health Snapshot */}
      {portfolio_snapshot && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Portfolio Health Snapshot
            </h3>
            <span className="text-xs text-slate-400 font-medium">Operational Benchmark</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
                <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-wider">Portfolio Health</CardTitle>
                <Activity className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent className="pt-3">
                <div className="text-2xl font-black text-slate-900">{portfolio_snapshot.portfolio_health_rate}%</div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  {portfolio_snapshot.portfolio_id} resolution rate
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
                <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-wider">Portfolio Open Cases</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="pt-3">
                <div className="text-2xl font-black text-amber-600">{portfolio_snapshot.portfolio_open_count}</div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Active exceptions in your scope
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
                <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-wider">Company Avg Health</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent className="pt-3">
                <div className="text-2xl font-black text-slate-900">{portfolio_snapshot.company_health_rate}%</div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Organization-wide benchmark
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
                <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-wider">Company Open Total</CardTitle>
                <Briefcase className="h-4 w-4 text-slate-600" />
              </CardHeader>
              <CardContent className="pt-3">
                <div className="text-2xl font-black text-slate-900">{portfolio_snapshot.company_open_count}</div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Across all portfolios
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Task 2.3 — Pending My Action List */}
      {pending_my_action.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Pending My Action ({pending_my_action.length})
            </h3>
            <span className="text-xs text-rose-600 font-semibold">Requires Your Co-Sign or Review</span>
          </div>

          <div className="bg-white/40 backdrop-blur-xl border border-rose-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-200/60">
              {pending_my_action.map((action) => (
                <div key={action.case_id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-rose-50/30 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">{action.case_id}</span>
                      {getSeverityBadge(action.severity)}
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        {action.action_type === 'CO_SIGN_REQUEST' ? 'CO-SIGN REQUIRED' : 'DIRECT ESCALATION'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-4">
                      <span>Reason: <span className="font-medium text-slate-700">{action.exception_code}</span></span>
                      <span>Impact: <span className="font-mono font-bold text-rose-700">₹{action.delta_inr.toLocaleString()}</span></span>
                      <span>Proposed by: <span className="font-mono text-slate-700">{action.maker_email}</span></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center">
                    {renderSLABadge(action.severity, action.opened_at)}
                    <Button 
                      size="sm" 
                      onClick={() => navigate(`/exceptions/${action.case_id}`)}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
                    >
                      Review & Co-sign
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task 2.2 — My Performance Panel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              My Performance
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Personal transparency & quality metrics for {data.reviewer_email}. Visible only to you.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-[11px] font-bold text-slate-600 uppercase">Resolved This Week</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-xl font-bold text-slate-900">{my_performance.resolved_this_week}</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Current work week</p>
            </CardContent>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-[11px] font-bold text-slate-600 uppercase">Resolved This Month</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-xl font-bold text-slate-900">{my_performance.resolved_this_month}</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Month-to-date</p>
            </CardContent>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-[11px] font-bold text-slate-600 uppercase">Avg Decision Time</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-xl font-bold text-slate-900">{my_performance.avg_time_to_decision_hours}h</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Triage turnaround</p>
            </CardContent>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-[11px] font-bold text-slate-600 uppercase">Approval Rate</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-xl font-bold text-emerald-600">{Math.round(my_performance.approval_ratio * 100)}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">{my_performance.approved_count} approved</p>
            </CardContent>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-[11px] font-bold text-slate-600 uppercase">Rejection Rate</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-xl font-bold text-rose-600">{Math.round(my_performance.rejection_ratio * 100)}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">{my_performance.rejected_count} rejected</p>
            </CardContent>
          </Card>

          <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-[11px] font-bold text-slate-600 uppercase">D2 Quality Flag Rate</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="text-xl font-bold text-amber-600">{my_performance.flag_rate}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">{my_performance.flagged_reasons_count} soft-flagged</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Task 2.1 — Case Preview Panel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              Case Preview ({displayedQueue.length} {isAdmin ? 'Critical ' : 'Open '}Cases)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAdmin
                ? 'Critical issues requiring administrative oversight across portfolios.'
                : <>Strictly scoped to portfolio <span className="font-semibold text-slate-600">{data.portfolio_id || 'GLOBAL'}</span>, sorted by severity priority and age.</>}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">Configured SLAs: 24h / 3d / 7d / 14d</span>
        </div>

        <div className="bg-white/40 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
          {displayedQueue.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">
                {isAdmin ? 'No critical issues in preview!' : 'Queue is completely clear!'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {isAdmin 
                  ? 'All critical issues have been resolved or actioned.' 
                  : 'All cases in your portfolio have been resolved or actioned.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/60 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Case ID</th>
                    <th className="py-3 px-4">Exception Reason</th>
                    <th className="py-3 px-4">Unresolved Delta</th>
                    <th className="py-3 px-4">Opened</th>
                    <th className="py-3 px-4">SLA / Age Status</th>
                    {!isAdmin && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40">
                  {displayedQueue.map((item) => (
                    <tr key={item.case_id} className="hover:bg-white/60 transition-colors">
                      <td className="py-3 px-4">{getSeverityBadge(item.severity)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <Link to={`/exceptions/${item.case_id}`} className="hover:underline text-blue-600">
                          {item.case_id}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">{item.exception_code}</td>
                      <td className="py-3 px-4 font-mono font-bold text-rose-600">
                        ₹{item.delta_inr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {item.opened_at ? formatDateTime(item.opened_at) : 'N/A'}
                      </td>
                      <td className="py-3 px-4">{renderSLABadge(item.severity, item.opened_at)}</td>
                      {!isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => navigate(`/exceptions/${item.case_id}`)}
                            className="text-xs hover:bg-slate-100 font-medium"
                          >
                            Resolve <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
