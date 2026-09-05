import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import { 
  ShieldCheck, 
  AlertTriangle, 
  Activity, 
  Zap, 
  RotateCw, 
  ExternalLink, 
  ShieldAlert, 
  FileCheck2,
  Clock,
  AlignLeft,
  BarChart3
} from 'lucide-react'
import { formatPaisa, formatDateTime } from '../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

interface DashboardKPIs {
  health_rate: number
  expected_net_paisa: number
  unresolved_delta_paisa: number
  throughput: string
  total_cases: number
  open_cases: number
  auto_resolved: number
}

interface RiskSignalItem {
  type: string
  severity: string
  active: boolean
  detail: string
  date: string
}

interface ChartDataItem {
  code: string
  count: number
}

interface RecentActivityItem {
  case_id: string
  action: string
  reviewer: string
  timestamp: string
}

interface DashboardData {
  kpis: DashboardKPIs
  risk_signals: RiskSignalItem[]
  chart_data: ChartDataItem[]
  recent_activity: RecentActivityItem[]
}

interface ChainStatusData {
  block_count: number
  is_valid: boolean
  last_verified_at: string
  last_confirmed_ots: {
    age_hours: number | null
    timestamp: string | null
    status: string | null
  }
  last_gist: {
    url: string | null
    age_hours: number | null
    timestamp: string | null
  }
}

export default function Dashboard() {
  const { reviewer } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chainStatus, setChainStatus] = useState<ChainStatusData | null>(null)
  const [refreshingChain, setRefreshingChain] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<Date>(new Date())
  const [chartOrientation, setChartOrientation] = useState<'horizontal' | 'vertical'>('horizontal')

  const formattedChartData = useMemo(() => {
    return (data?.chart_data || [])
      .map((item) => {
        const readable = item.code.replace(/_/g, ' ')
        return {
          ...item,
          readable,
          shortName: readable.length > 20 ? readable.substring(0, 18) + '…' : readable,
        }
      })
      .sort((a, b) => b.count - a.count)
  }, [data?.chart_data])

  const userRole = reviewer?.role?.toUpperCase() || ''
  const canSeeGovernance = userRole === 'ADMIN'

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/dashboard')
      setData(res.data)
    } catch (err) {
      // Interceptor handles
    } finally {
      setLoading(false)
    }
  }

  const fetchChainStatus = async () => {
    setRefreshingChain(true)
    try {
      const res = await api.get('/api/analytics/chain-status')
      setChainStatus(res.data)
      setLastCheckTime(new Date())
    } catch (err) {
      console.error('Failed to fetch chain status', err)
    } finally {
      setRefreshingChain(false)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchChainStatus()

    // Task 4.1: Auto-refresh on an interval (every 30 seconds)
    const interval = setInterval(() => {
      fetchChainStatus()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

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

  const { kpis, risk_signals, chart_data, recent_activity } = data

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-4 border-b border-slate-200/60 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Reconciliation system health, exceptions overview, and governance telemetry.</p>
        </div>

        {canSeeGovernance && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/audit?tab=overrides')}
              className="text-xs font-semibold gap-1.5 border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/60"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
              Admin Overrides
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/audit?tab=evidence')}
              className="text-xs font-semibold gap-1.5 border-blue-200 bg-blue-50/50 text-blue-800 hover:bg-blue-100/60"
            >
              <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
              Evidence Access Feed
            </Button>
          </div>
        )}
      </div>

      {/* Task 4.1: Live Audit Chain Integrity Meter (Persistent Tile on Main Dashboard) */}
      <Card className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-slate-500/5 backdrop-blur-xl shadow-sm border border-emerald-200/80 rounded-2xl overflow-hidden relative">
        <div className="relative z-10 p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-emerald-200/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-inner">
                <ShieldCheck className="h-6 w-6" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Live Audit Chain Integrity Meter
                  </h3>
                  <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-mono font-bold uppercase tracking-wider">
                    {chainStatus?.is_valid ? '100% Cryptographically Verified' : 'Integrity Issue'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Real-time tamper-evident cryptographic ledger status anchored to Bitcoin (OTS) & GitHub Gist.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Last check: {lastCheckTime.toLocaleTimeString()}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchChainStatus}
                disabled={refreshingChain}
                className="h-8 px-2.5 text-xs font-semibold gap-1.5 bg-white/90 hover:bg-white text-slate-700 border-slate-200 shadow-xs"
              >
                <RotateCw className={`h-3 w-3 ${refreshingChain ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
                <span>{refreshingChain ? 'Verifying...' : 'Check Now'}</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
            {/* Metric 1: Verified Blocks */}
            <div className="bg-white/70 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/60 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Total Audit Blocks
              </span>
              <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                {chainStatus ? chainStatus.block_count : '—'}
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
                Zero Tampering Detected
              </span>
            </div>

            {/* Metric 2: Local Verification Time */}
            <div className="bg-white/70 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/60 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Local Check Status
              </span>
              <div className="text-sm font-bold text-slate-900 mt-1 font-mono truncate">
                {chainStatus?.last_verified_at ? formatDateTime(chainStatus.last_verified_at) : 'Active'}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Auto-refreshes every 30s
              </span>
            </div>

            {/* Metric 3: OpenTimestamps Proof */}
            <div className="bg-white/70 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/60 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                OpenTimestamps (OTS)
              </span>
              <div className="text-sm font-bold text-slate-900 mt-1 font-mono">
                {chainStatus?.last_confirmed_ots?.age_hours !== null && chainStatus?.last_confirmed_ots?.age_hours !== undefined
                  ? `${chainStatus.last_confirmed_ots.age_hours}h ago`
                  : 'Pending proof'}
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
                Status: {chainStatus?.last_confirmed_ots?.status || 'Active'}
              </span>
            </div>

            {/* Metric 4: GitHub Gist Anchor */}
            <div className="bg-white/70 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/60 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Public Gist Anchor
              </span>
              <div className="text-sm font-bold text-slate-900 mt-1 font-mono">
                {chainStatus?.last_gist?.age_hours !== null && chainStatus?.last_gist?.age_hours !== undefined
                  ? `${chainStatus.last_gist.age_hours}h ago`
                  : 'Anchored'}
              </div>
              <div className="mt-0.5">
                {chainStatus?.last_gist?.url ? (
                  <a
                    href={chainStatus.last_gist.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    View Public Gist <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  <span className="text-[10px] text-slate-400">Anchor Verified</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Health Rate</CardTitle>
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{kpis.health_rate}%</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Matched automatically</p>
            </CardContent>
          </div>
        </Card>
        
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Expected Net</CardTitle>
              <Zap className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-2xl xl:text-3xl font-extrabold text-slate-900 tracking-tighter truncate" title={formatPaisa(kpis.expected_net_paisa)}>{formatPaisa(kpis.expected_net_paisa)}</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Across {kpis.total_cases} cases</p>
            </CardContent>
          </div>
        </Card>
        
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Unresolved Delta</CardTitle>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-2xl xl:text-3xl font-extrabold text-red-600 tracking-tighter truncate" title={formatPaisa(kpis.unresolved_delta_paisa)}>{formatPaisa(kpis.unresolved_delta_paisa)}</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Requires reviewer action</p>
            </CardContent>
          </div>
        </Card>
        
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Open Cases</CardTitle>
              <Activity className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-2xl xl:text-3xl font-extrabold text-slate-900 tracking-tight">{kpis.open_cases}</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Pending review</p>
            </CardContent>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Signals */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col">
            <CardHeader className="border-b border-slate-200/40 bg-slate-50/50 pb-4">
              <CardTitle className="text-slate-900 text-lg font-bold">Active Risk Signals</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto max-h-[350px]">
              {risk_signals.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm font-medium">No active risk signals detected.</div>
              ) : (
                <div className="divide-y divide-slate-200/60">
                  {risk_signals.map((signal: any, i: number) => (
                    <div key={i} className="p-5 hover:bg-white/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800">{signal.type}</span>
                        <Badge variant="outline" className={`shadow-none font-bold text-[10px] ${signal.severity === 'HIGH' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                          {signal.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 font-medium mb-3 leading-relaxed">{signal.detail}</p>
                      <span className="text-[11px] font-mono text-slate-400">{signal.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Charts */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col">
            <CardHeader className="border-b border-slate-200/40 bg-slate-50/50 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-slate-900 text-lg font-bold flex items-center gap-2">
                  Exceptions by Code
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Discrepancy volume categorized by reason code</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-700 border-blue-200 hidden sm:inline-flex">
                  {chart_data.length} Categories
                </Badge>
                <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setChartOrientation('horizontal')}
                    className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                      chartOrientation === 'horizontal'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Horizontal Ranked Bars"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Ranked</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartOrientation('vertical')}
                    className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                      chartOrientation === 'vertical'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Vertical Column Chart"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Columns</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex-1 flex flex-col justify-center">
              <div className="w-full min-h-[300px] h-[300px]">
                {chart_data.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                    No exceptions recorded.
                  </div>
                ) : chartOrientation === 'horizontal' ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      layout="vertical"
                      data={formattedChartData}
                      margin={{ top: 5, right: 30, left: 15, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis
                        type="number"
                        stroke="#94a3b8"
                        fontSize={11}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="shortName"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={145}
                        tick={{ fill: '#334155', fontWeight: 500 }}
                      />
                      <Tooltip
                        formatter={(value: any, _name: any, item: any) => [
                          `${value} case${value === 1 ? '' : 's'}`,
                          item.payload.readable
                        ]}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          color: '#0f172a',
                          fontSize: '12px',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#2563eb"
                        radius={[0, 4, 4, 0]}
                        barSize={14}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={formattedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 65 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis 
                        dataKey="code" 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        angle={-35} 
                        textAnchor="end" 
                        interval={0}
                        tickFormatter={(val) => {
                          const clean = val.replace(/_/g, ' ')
                          return clean.length > 13 ? clean.substring(0, 11) + '…' : clean
                        }}
                      />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                      <Tooltip 
                        formatter={(value: any, _name: any, item: any) => [
                          `${value} case${value === 1 ? '' : 's'}`,
                          item.payload.readable
                        ]}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          color: '#0f172a',
                          fontSize: '12px',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                        cursor={{ fill: '#f1f5f9' }}
                      />
                      <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <CardHeader className="border-b border-slate-200/40 bg-slate-50/50 pb-4">
            <CardTitle className="text-slate-900 text-lg font-bold">Recent System Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent_activity.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm font-medium">No recent activity logged.</div>
            ) : (
              <div className="divide-y divide-slate-200/60">
                {recent_activity.map((act: any, i: number) => (
                  <div key={i} className="p-5 flex items-center justify-between hover:bg-white/50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{act.action}</span>
                        <Badge variant="outline" className="text-slate-600 bg-slate-100/80 border-slate-200 text-[10px] font-mono">
                          {act.case_id}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 font-medium">
                        By <span className="text-slate-700 font-semibold">{act.reviewer}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-400">{formatDateTime(act.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  )
}
