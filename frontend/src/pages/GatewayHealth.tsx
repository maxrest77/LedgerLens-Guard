import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import {
  ArrowRightLeft,
  RefreshCw,
  Info,
  Sparkles,
  Compass,
  FileSpreadsheet
} from 'lucide-react'
import { formatPaisa } from '../lib/formatters'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts'

export interface PSPMDR {
  expected_rate_pct: number
  actual_rate_pct: number
  deviation_pct: number
  fee_mismatch_count: number
}

export interface PSPTrustScore {
  composite: number
  match_rate_score: number
  settlement_latency_score: number
  fee_accuracy_score: number
  anomaly_freedom_score: number
}

export interface PSPHealthItem {
  psp_provider: string
  is_synthetic: boolean
  match_rate: number
  total_volume_paisa: number
  settlements_count: number
  payments_count: number
  exception_count: number
  latency_ms: number
  avg_settlement_hours: number
  uptime_history: number[]
  status: string
  mdr: PSPMDR
  trust_score: PSPTrustScore
  match_rate_sparkline: number[]
}

export interface RadarMetricRow {
  metric: string
  [key: string]: string | number
}

export interface RoutingAdvice {
  has_recommendation: boolean
  is_advisory_only: boolean
  recommendation: string | null
  leader_psp?: string
  benchmark_psp?: string
  cost_advantage_pct?: number
  exception_reduction_pct?: number
  z_score?: number
  reason?: string
  evaluated_gateways?: string[]
  total_evaluated_txns?: number
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = (data || []).map((val, idx) => ({ idx, val }))
  return (
    <div className="h-8 w-24">
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

const radarColors: Record<string, { stroke: string; fill: string }> = {
  VELOCEPAY: { stroke: '#4f46e5', fill: '#4f46e5' },
  PRISMPAY: { stroke: '#0284c7', fill: '#0284c7' },
  CLEARSETTLE: { stroke: '#059669', fill: '#059669' },
  STRATAPAY: { stroke: '#8b5cf6', fill: '#8b5cf6' },
}

export default function GatewayHealth() {
  const [pspData, setPspData] = useState<PSPHealthItem[]>([])
  const [radarMetrics, setRadarMetrics] = useState<RadarMetricRow[]>([])
  const [routingAdvice, setRoutingAdvice] = useState<RoutingAdvice | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAdminData = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const pspRes = await api.get('/api/admin/psp-health')
      setPspData(pspRes.data.data || [])
      setRadarMetrics(pspRes.data.radar_metrics || [])
      setRoutingAdvice(pspRes.data.routing_advisor || null)
    } catch (err) {
      console.error('Error fetching gateway health:', err)
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
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
          <span>Ingesting multi-gateway telemetry and MDR metrics...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Gateway Health & Infrastructure</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Multi-Gateway Active ({pspData.length} Providers)
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <span>PSP-Agnostic Reconciliation, MDR Deviations, and Normalized Trust Metrics</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAdminData(true)}
          disabled={refreshing}
          className="h-9 gap-2 text-xs font-mono"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Telemetry'}
        </Button>
      </div>

      {/* Task 11.5: Smart Routing Advisor Panel */}
      <Card className={`shadow-sm backdrop-blur-xl border ${
        routingAdvice?.has_recommendation 
          ? 'border-indigo-200 bg-gradient-to-r from-indigo-50/50 via-white/80 to-slate-50/50' 
          : 'border-slate-200/60 bg-white/70'
      }`}>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                routingAdvice?.has_recommendation ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Smart Routing Advisor
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Plain-language comparative cost and reliability intelligence across active payment gateways
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-mono border-amber-300 text-amber-800 bg-amber-50">
                Advisory Only — Manual Action Required
              </Badge>
              {routingAdvice?.has_recommendation && (
                <Badge variant="outline" className="text-[11px] font-mono border-indigo-200 text-indigo-700 bg-indigo-50">
                  Statistically Significant (p &lt; 0.05, z={routingAdvice.z_score})
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {routingAdvice?.has_recommendation ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/90 border border-indigo-100 shadow-xs">
                <p className="text-sm font-medium text-slate-800 leading-relaxed">
                  {routingAdvice.recommendation}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/60">
                  <span className="text-slate-500 block">Leader Gateway</span>
                  <span className="font-bold text-indigo-700 text-sm mt-0.5 block">{routingAdvice.leader_psp}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/60">
                  <span className="text-slate-500 block">Cost Advantage</span>
                  <span className="font-bold text-emerald-600 text-sm mt-0.5 block">+{routingAdvice.cost_advantage_pct}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/60">
                  <span className="text-slate-500 block">Exception Reduction</span>
                  <span className="font-bold text-emerald-600 text-sm mt-0.5 block">-{routingAdvice.exception_reduction_pct}%</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/60">
                  <span className="text-slate-500 block">Evaluated Sample</span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">{routingAdvice.total_evaluated_txns} txns</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/60 flex items-start gap-3">
              <Info className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-700">Noise Threshold Active: No Statistically Meaningful Drift</p>
                <p className="text-slate-500">
                  {routingAdvice?.reason || 'Performance variance across active gateways is within normal statistical deviation (p > 0.05). No manual routing shift is suggested.'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task 11.3: Gateway Trust Score (Radar Comparison) */}
      <Card className="border-slate-200/60 shadow-sm bg-white/70 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Compass className="h-5 w-5 text-indigo-600" />
                Gateway Trust Score (Radar Comparison)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Normalized 4-pillar comparison: Match Rate, Settlement Latency, Fee Accuracy, and Anomaly Freedom
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {pspData.map((psp) => (
                <div key={psp.psp_provider} className="flex items-center gap-1.5 text-xs font-mono">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: radarColors[psp.psp_provider]?.stroke || '#94a3b8' }}
                  />
                  <span className="font-semibold text-slate-700">{psp.psp_provider}</span>
                  <span className="text-slate-400">({psp.trust_score?.composite ?? 0})</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarMetrics}>
                  <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <PolarAngleAxis
                    dataKey="metric"
                    stroke="#475569"
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#94a3b8" fontSize={9} />
                  {pspData.map((psp) => {
                    const styling = radarColors[psp.psp_provider] || { stroke: '#64748b', fill: '#64748b' }
                    return (
                      <Radar
                        key={psp.psp_provider}
                        name={`${psp.psp_provider}${psp.is_synthetic ? ' (Demo)' : ''}`}
                        dataKey={psp.psp_provider}
                        stroke={styling.stroke}
                        fill={styling.fill}
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                    )
                  })}
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      color: '#f8fafc',
                      fontSize: '11px',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Composite Rank Cards */}
            <div className="lg:col-span-4 space-y-3">
              <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">
                Composite Trust Rankings
              </p>
              {pspData
                .slice()
                .sort((a, b) => (b.trust_score?.composite ?? 0) - (a.trust_score?.composite ?? 0))
                .map((psp, idx) => (
                  <div
                    key={psp.psp_provider}
                    className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/50 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-slate-900">{psp.psp_provider}</span>
                          {psp.is_synthetic && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200">
                              Demo
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">
                          Match: {psp.match_rate}% • Fee Acc: {psp.trust_score?.fee_accuracy_score ?? 100}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-lg font-black text-slate-900">{psp.trust_score?.composite ?? 0}</span>
                      <span className="text-[10px] text-slate-400 block">/ 100</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks 11.1, 11.2, 11.4: Multi-Gateway PSP Performance Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Provider Performance & MDR Audit Panels
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            {pspData.filter(p => p.is_synthetic).length} Synthetic Gateways • 1 Production Gateway
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {pspData.map((psp) => {
            const isFavorable = (psp.mdr?.deviation_pct ?? 0) <= 0
            return (
              <Card
                key={psp.psp_provider}
                className="border-slate-200/70 shadow-sm bg-white/80 backdrop-blur-xl flex flex-col justify-between"
              >
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-xl bg-indigo-50/80 flex items-center justify-center border border-indigo-100">
                        <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold text-slate-900">
                          {psp.psp_provider}
                        </CardTitle>
                        <p className="text-xs text-slate-500 font-mono">
                          {psp.settlements_count} sets • {psp.payments_count} txns
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {/* Task 11.2: Demo data honesty constraint */}
                      {psp.is_synthetic ? (
                        <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50 text-[10px] font-mono">
                          Demo / Synthetic Data
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px] font-mono">
                          Production Live
                        </Badge>
                      )}
                      <Badge
                        variant={psp.status === 'HEALTHY' ? 'success' : 'destructive'}
                        className="text-[10px] px-2 py-0"
                      >
                        {psp.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  {/* Match Rate & Inline Sparkline (Task 11.4) */}
                  <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500 font-mono block">Reconciliation Match Rate</span>
                      <span className="text-2xl font-black text-slate-900 font-mono">{psp.match_rate}%</span>
                    </div>
                    <div className="text-right">
                      <Sparkline
                        data={psp.match_rate_sparkline || []}
                        color={psp.match_rate >= 95 ? '#10b981' : '#f43f5e'}
                      />
                      <span className="text-[10px] text-slate-400 font-mono">7-Period Trend</span>
                    </div>
                  </div>

                  {/* Operational Telemetry */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-50/50 border border-slate-100">
                      <span className="text-slate-400 block text-[11px]">Gross Volume</span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 block truncate">
                        {formatPaisa(psp.total_volume_paisa)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50/50 border border-slate-100">
                      <span className="text-slate-400 block text-[11px]">Avg Settlement Window</span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                        {psp.avg_settlement_hours}h ({psp.latency_ms}ms API)
                      </span>
                    </div>
                  </div>

                  {/* Task 11.1: MDR Deviation Panel */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                      <span className="text-xs font-bold text-slate-700 font-mono flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-600" />
                        MDR Fee Deviation Audit
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">Versioned Rules</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Expected MDR</span>
                        <span className="font-bold text-slate-700">{psp.mdr?.expected_rate_pct ?? 0}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Observed MDR</span>
                        <span className="font-bold text-slate-900">{psp.mdr?.actual_rate_pct ?? 0}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Rate Deviation</span>
                        <span className={`font-bold ${isFavorable ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {(psp.mdr?.deviation_pct ?? 0) > 0 ? `+${psp.mdr?.deviation_pct}%` : `${psp.mdr?.deviation_pct ?? 0}%`}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-500">Fee Rate Mismatch Cases:</span>
                      <Badge
                        variant={(psp.mdr?.fee_mismatch_count ?? 0) > 0 ? 'warning' : 'outline'}
                        className="text-[10px] font-mono"
                      >
                        {psp.mdr?.fee_mismatch_count ?? 0} exceptions
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
