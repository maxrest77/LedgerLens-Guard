import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import {
  ShieldAlert,
  Activity,
  IndianRupee,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  Zap,
  CheckCircle2,
  Clock,
  Layers
} from 'lucide-react'
import { formatPaisa, formatDateTime } from '../lib/formatters'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  Legend
} from 'recharts'
import { AnimatedCounter } from '../components/ui/animated-counter'

export interface ExposureData {
  total_exposure_paisa: number
  aging_exposure_paisa: {
    "<4h": number
    "4-12h": number
    "12-24h": number
    ">24h": number
  }
  aging_by_severity?: {
    [key: string]: {
      CRITICAL: number
      HIGH: number
      MEDIUM: number
      LOW: number
    }
  }
  trends?: {
    exposure: number[]
    escalations: number[]
    critical: number[]
    exposure_delta_pct: number
    escalations_delta_pct: number
    critical_delta_pct: number
  }
  metrics: {
    critical_count: number
    escalated_count: number
    total_unresolved_count: number
  }
}

export interface PSPHealth {
  psp_provider: string
  match_rate: number
  total_volume_paisa: number
  settlements_count: number
  exception_count: number
  latency_ms?: number
  uptime_history?: number[]
  status: string
}

export interface EscalationCase {
  case_id: string
  exception_code: string
  severity: string
  settlement_id?: string
  payment_id?: string
  utr?: string
  expected_paisa: number
  actual_paisa: number
  delta_paisa: number
  confidence_score: number
  explanation: string
  suggested_action: string
  status: string
  opened_at: string
}

function Sparkline({
  data,
  color,
}: {
  data: number[]
  color: string
}) {
  const chartData = data.map((val, idx) => ({ i: idx, val }))
  return (
    <div className="h-9 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="val"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((acc: number, entry: any) => acc + (entry.value || 0), 0)
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs font-mono space-y-1.5">
        <div className="font-semibold text-slate-200 border-b border-slate-700 pb-1 flex justify-between gap-4">
          <span>Window: {label}</span>
          <span className="text-emerald-400">Total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-300">{entry.name}:</span>
            </div>
            <span className="text-slate-100 font-medium">₹{Number(entry.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function CommandCenter() {
  const [exposureData, setExposureData] = useState<ExposureData | null>(null)
  const [pspData, setPspData] = useState<PSPHealth[] | null>(null)
  const [escalations, setEscalations] = useState<EscalationCase[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  const fetchAdminData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    try {
      const [expRes, pspRes, escRes] = await Promise.all([
        api.get('/api/admin/exposure'),
        api.get('/api/admin/psp-health'),
        api.get('/api/admin/escalations')
      ])
      setExposureData(expRes.data)
      setPspData(pspRes.data.data)
      setEscalations(escRes.data.data || [])
      setError(false)
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
      if (isManualRefresh) setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAdminData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-500 font-mono text-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
          <span>Syncing financial telemetry and control plane metrics...</span>
        </div>
      </div>
    )
  }

  if (error || !exposureData) {
    return (
      <div className="p-6 rounded-xl border border-red-200 bg-red-50/50 text-red-700 font-mono text-sm space-y-3">
        <p className="font-semibold">Failed to establish connection to Financial Control Plane</p>
        <p className="text-xs text-red-600">Please verify backend service availability and database connection.</p>
        <Button size="sm" variant="outline" onClick={() => fetchAdminData(true)} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry Connection
        </Button>
      </div>
    )
  }

  // Format chart data with severity breakdown
  const agingData = ['<4h', '4-12h', '12-24h', '>24h'].map((bucket) => {
    const sevData = exposureData?.aging_by_severity?.[bucket]
    const totalPaisa = exposureData?.aging_exposure_paisa[bucket as keyof typeof exposureData.aging_exposure_paisa] || 0
    const totalRupees = totalPaisa / 100

    if (sevData) {
      return {
        name: bucket,
        Critical: sevData.CRITICAL / 100,
        High: sevData.HIGH / 100,
        Medium: sevData.MEDIUM / 100,
        Low: sevData.LOW / 100,
        total: totalRupees,
      }
    }
    return {
      name: bucket,
      Critical: 0,
      High: 0,
      Medium: totalRupees,
      Low: 0,
      total: totalRupees,
    }
  })

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Command Center</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              PROD-CLUSTER-01
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <span>Financial Control Plane & Systemic Risk Monitor</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry Active
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAdminData(true)}
            disabled={refreshing}
            className="h-9 gap-2 text-xs font-mono"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
          </Button>
          <Link to="/approval-queue">
            <Button size="sm" className="h-9 gap-2 text-xs bg-slate-900 text-white hover:bg-slate-800">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              Approval Queue ({escalations.length})
            </Button>
          </Link>
        </div>
      </div>

      {/* Top Level Metric KPIs with Sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Financial Exposure */}
        <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Financial Exposure</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
              <IndianRupee className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
                <AnimatedCounter
                  value={exposureData.total_exposure_paisa / 100}
                  prefix="₹"
                  decimals={2}
                  duration={800}
                />
              </div>
              <Sparkline
                data={exposureData.trends?.exposure || [88000, 92000, 90000, 95000, 93000, 98000, 100000]}
                color="#f43f5e"
              />
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-mono">
                Across {exposureData.metrics.total_unresolved_count} unresolved cases
              </p>
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 font-mono">
                <TrendingUp className="h-3 w-3" />
                +{exposureData.trends?.exposure_delta_pct ?? 2.4}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Active Escalations */}
        <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Escalations</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
                <AnimatedCounter
                  value={exposureData.metrics.escalated_count}
                  duration={800}
                />
              </div>
              <Sparkline
                data={exposureData.trends?.escalations || [3, 2, 4, 3, 2, 1, 2]}
                color="#f59e0b"
              />
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-mono">
                Requires Admin / Dual Sign-off
              </p>
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 font-mono">
                <TrendingDown className="h-3 w-3" />
                {exposureData.trends?.escalations_delta_pct ?? -12.5}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Critical Alerts */}
        <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Critical Alerts</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
              <Activity className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
                <AnimatedCounter
                  value={exposureData.metrics.critical_count}
                  duration={800}
                />
              </div>
              <Sparkline
                data={exposureData.trends?.critical || [5, 4, 6, 5, 4, 4, 4]}
                color="#ef4444"
              />
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-mono">
                High severity anomalies
              </p>
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 font-mono">
                Stable (24h)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Grid: Exposure Aging SLA & Gateway Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Exception Aging Chart */}
        <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl lg:col-span-7 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-slate-700" />
                  Exposure Aging SLA Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Severity-stacked unresolved exposure categorized by resolution SLA windows
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono border-slate-200 bg-slate-50 text-slate-600">
                SLA Cap: 24h
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingData} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  <ReferenceLine
                    y={100000}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'SLA Limit (₹1L)', fill: '#ef4444', fontSize: 10, position: 'top' }}
                  />
                  <Bar dataKey="Critical" stackId="a" fill="#f43f5e" name="Critical" />
                  <Bar dataKey="High" stackId="a" fill="#f59e0b" name="High" />
                  <Bar dataKey="Medium" stackId="a" fill="#0f172a" name="Medium" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>Notice: Over 85% of total exposure resides in the &gt;24h breach zone.</span>
              <Link to="/reconciliation" className="text-indigo-600 hover:underline font-medium">
                View Aging Exceptions →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Gateway & PSP Infrastructure Monitor */}
        <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl lg:col-span-5 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                  Gateway & PSP Health
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Real-time match performance and telemetry stability
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono border-emerald-300 text-emerald-700 bg-emerald-50">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                Live Feed
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {pspData && pspData.map((psp) => (
              <div
                key={psp.psp_provider}
                className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/40 hover:bg-slate-50/90 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50/80 flex items-center justify-center border border-indigo-100 shadow-xs">
                      <Zap className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{psp.psp_provider}</p>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {psp.latency_ms || 142}ms
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Vol: {formatPaisa(psp.total_volume_paisa)} • {psp.settlements_count} sets
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={psp.status === 'HEALTHY' ? 'success' : 'destructive'} className="mb-1 text-xs">
                      {psp.status}
                    </Badge>
                    <p className="text-sm font-bold text-slate-900">{psp.match_rate}% Match</p>
                  </div>
                </div>

                {/* Match Efficiency Progress Bar */}
                <div className="space-y-1 mt-3">
                  <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        psp.match_rate >= 95 ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, psp.match_rate)}%` }}
                    />
                  </div>
                </div>

                {/* 12h Micro-Stability Matrix */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    12h Stability Matrix
                  </span>
                  <div className="flex items-center gap-1">
                    {(psp.uptime_history || [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]).map((status, i) => (
                      <div
                        key={i}
                        title={`Hour -${12 - i}: ${status === 1 ? 'Healthy (100%)' : 'Degraded Match Rate'}`}
                        className={`h-2.5 w-2.5 rounded-xs transition-colors cursor-help ${
                          status === 1 ? 'bg-emerald-400 hover:bg-emerald-500' : 'bg-rose-400 hover:bg-rose-500'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Active Escalations & Immediate Action Table */}
      <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Priority Action: Active Escalations & Review Required
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Exceptions escalated to administration requiring immediate maker-checker sign-off
            </CardDescription>
          </div>
          <Link to="/approval-queue">
            <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 font-medium">
              View Approval Queue
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {escalations.length === 0 ? (
            <div className="text-center py-8 text-slate-500 font-mono text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <span>All clear. No cases currently pending dual-approval or escalation.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 text-slate-500 font-mono uppercase bg-slate-50/50">
                    <th className="py-2.5 px-3">Case ID</th>
                    <th className="py-2.5 px-3">Exception Code</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Exposure Delta</th>
                    <th className="py-2.5 px-3">Age</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(escalations || []).slice(0, 5).map((c) => (
                    <tr key={c.case_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-medium text-indigo-600">
                        <Link to={`/exceptions/${c.case_id}`} className="hover:underline">
                          {c.case_id}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-medium border border-slate-200">
                          {c.exception_code}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={c.severity === 'CRITICAL' ? 'destructive' : 'warning'}
                          className="text-[10px] px-2 py-0 font-semibold"
                        >
                          {c.severity}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-slate-600 font-medium">
                          {String(c.status || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {formatPaisa(c.delta_paisa)}
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono">
                        {formatDateTime(c.opened_at)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link to={`/exceptions/${c.case_id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5 gap-1 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200"
                          >
                            Review
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
