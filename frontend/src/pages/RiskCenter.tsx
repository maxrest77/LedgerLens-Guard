import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import api from '../lib/api'
import { formatDateTime } from '../lib/formatters'
import { useAuthStore } from '../store/auth'
import {
  ShieldAlert,
  Flame,
  Activity,
  RotateCw,
  Search,
  ExternalLink,
  Layers,
  Zap,
  Info,
  Calendar,
  Sparkles
} from 'lucide-react'
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts'

// ── Types ───────────────────────────────────────────────────────────────────

interface CorrelationMatrixRow {
  signal: string
  label: string
  velocity_spike?: number
  refund_anomaly?: number
  ip_clustering?: number
  settlement_gap?: number
  [key: string]: any
}

interface RiskEventItem {
  id: string
  case_id: string
  signal_type: string
  signal_label: string
  severity: string
  timestamp: string
  date: string
  z_score: number
  detail: string
  portfolio_id: string
  delta_inr: number
  concurrent_signals: string[]
  is_multi_signal: boolean
}

interface TimelineBucket {
  date: string
  total_events: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  signal_counts: Record<string, number>
}

interface RiskCorrelationResponse {
  widget_type: string
  portfolio_scope: string
  total_cases_analyzed: number
  multi_signal_flagged_cases: number
  disclaimer: string
  rule_i1_standard: string
  correlation_matrix: CorrelationMatrixRow[]
  signals_list: string[]
  signal_labels: Record<string, string>
  events: RiskEventItem[]
  timeline_summary: TimelineBucket[]
  signal_breakdown?: Record<string, { label: string; count: number; share_pct: number }>
  co_occurrences?: Array<{ pair: string; signal_a: string; signal_b: string; count: number; co_occurrence_pct: number }>
}

const SIGNAL_COLOR_MAP: Record<string, string> = {
  velocity_spike: '#e11d48',   // Rose 600
  refund_anomaly: '#ea580c',   // Orange 600
  ip_clustering: '#d97706',    // Amber 600
  settlement_gap: '#0284c7',   // Sky 600
  statistical_anomaly: '#64748b' // Slate 500
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#e11d48',
  HIGH: '#ea580c',
  MEDIUM: '#d97706',
  LOW: '#64748b',
  INFO: '#3b82f6'
}

export default function RiskCenter() {
  const { reviewer } = useAuthStore()
  const [data, setData] = useState<RiskCorrelationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filtering states for Task 9.3 (Full list)
  const [selectedSignalFilter, setSelectedSignalFilter] = useState<string>('ALL')
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('ALL')
  const [multiSignalOnly, setMultiSignalOnly] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [hoveredPair, setHoveredPair] = useState<{ s1: string; s2: string; count: number } | null>(null)

  // Reimagined Timeline States (Task 9.2)
  const [timelineView, setTimelineView] = useState<'stream' | 'swimlanes' | 'scatter'>('stream')
  const [timelineRange, setTimelineRange] = useState<'7D' | '14D' | 'ALL'>('14D')
  const [timelineSignalFilter, setTimelineSignalFilter] = useState<string>('ALL')
  const [activeBucketDate, setActiveBucketDate] = useState<string | null>(null)

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await api.get('/api/analytics/risk-correlation')
      setData(res.data)
    } catch (err) {
      console.error('Failed to load risk center correlation data', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ── Filtered Daily Timeline Buckets (Zero-Congestion Volume Stream) ────────
  const filteredTimelineBuckets = useMemo(() => {
    if (!data?.timeline_summary) return []
    let list = [...data.timeline_summary]

    if (timelineRange === '7D') {
      list = list.slice(-7)
    } else if (timelineRange === '14D') {
      list = list.slice(-14)
    }

    return list.map((b) => {
      const parts = (b.date || '').split('-')
      const formattedDate = parts.length === 3 ? `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}` : (b.date || '—')

      const relevantCount = timelineSignalFilter === 'ALL'
        ? b.total_events
        : (b.signal_counts?.[timelineSignalFilter] || 0)

      return {
        ...b,
        formattedDate,
        displayTotal: relevantCount,
        critical: timelineSignalFilter === 'ALL' ? b.critical_count : (b.signal_counts?.[timelineSignalFilter] ? Math.min(b.critical_count, relevantCount) : 0),
        high: timelineSignalFilter === 'ALL' ? b.high_count : (b.signal_counts?.[timelineSignalFilter] ? Math.min(b.high_count, relevantCount) : 0),
        medium: timelineSignalFilter === 'ALL' ? b.medium_count : (b.signal_counts?.[timelineSignalFilter] ? Math.min(b.medium_count, relevantCount) : 0),
        low: timelineSignalFilter === 'ALL' ? b.low_count : (b.signal_counts?.[timelineSignalFilter] ? Math.min(b.low_count, relevantCount) : 0),
      }
    })
  }, [data?.timeline_summary, timelineRange, timelineSignalFilter])

  // ── Decongested Scatter Data with Vertical Lane Jitter ─────────────────────
  const decongestedScatterData = useMemo(() => {
    if (!data?.events) return []

    const signalYMap: Record<string, number> = {
      velocity_spike: 4,
      refund_anomaly: 3,
      ip_clustering: 2,
      settlement_gap: 1
    }

    let events = [...data.events]
    if (timelineSignalFilter !== 'ALL') {
      events = events.filter((e) => e.signal_type === timelineSignalFilter)
    }

    if (timelineRange !== 'ALL' && data?.timeline_summary?.length) {
      const sliceCount = timelineRange === '7D' ? 7 : 14
      const validDates = new Set((data?.timeline_summary || []).slice(-sliceCount).map((b) => b?.date))
      events = events.filter((e) => validDates.has(e.date))
    }

    // Group by date + signal to distribute points vertically inside each lane
    const dateSignalCounts: Record<string, number> = {}
    const dateSignalIndex: Record<string, number> = {}

    events.forEach((e) => {
      const key = `${e.date}_${e.signal_type}`
      dateSignalCounts[key] = (dateSignalCounts[key] || 0) + 1
    })

    return events.map((e, idx) => {
      const key = `${e.date}_${e.signal_type}`
      const count = dateSignalCounts[key] || 1
      const itemIdx = dateSignalIndex[key] || 0
      dateSignalIndex[key] = itemIdx + 1

      // Smart vertical distribution within lane bounds so dots never stack into a solid tube
      const baseLane = signalYMap[e.signal_type] || 2
      let yOffset = 0
      if (count > 1) {
        yOffset = -0.28 + (itemIdx / (count - 1)) * 0.56
      }

      const dateObj = new Date(e.timestamp)
      return {
        x: dateObj.getTime(),
        y: baseLane + yOffset,
        baseY: baseLane,
        z: Math.min(Math.max(e.z_score * 2.5, 6), 14), // crisp, proportional dot radius
        id: e.id,
        dateStr: e.date,
        timeStr: formatDateTime(e.timestamp),
        signal_type: e.signal_type,
        signal_label: e.signal_label,
        severity: e.severity,
        z_score: e.z_score,
        case_id: e.case_id,
        concurrent_signals: e.concurrent_signals,
        is_multi_signal: e.is_multi_signal,
        color: SEVERITY_COLORS[e.severity] || '#64748b',
        index: idx
      }
    })
  }, [data?.events, data?.timeline_summary, timelineSignalFilter, timelineRange])

  // Summary Metrics for the Timeline
  const timelineStats = useMemo(() => {
    if (!data?.timeline_summary) return { activeDays: 0, peakDate: 'N/A', peakCount: 0, multiDays: 0 }
    let peakCount = 0
    let peakDate = 'N/A'
    let activeDays = 0
    let multiDays = 0

    data.timeline_summary.forEach((b) => {
      if (b.total_events > 0) activeDays++
      if (b.total_events > peakCount) {
        peakCount = b.total_events
        peakDate = b.date
      }
      if (Object.keys(b.signal_counts || {}).length >= 2) {
        multiDays++
      }
    })

    return { activeDays, peakDate, peakCount, multiDays }
  }, [data?.timeline_summary])

  // Events pinned for active date inspector
  const eventsForActiveDate = useMemo(() => {
    if (!activeBucketDate || !data?.events) return []
    return data.events.filter((e) => e.date === activeBucketDate)
  }, [activeBucketDate, data?.events])

  // ── Filtered Events for Full List (Task 9.3) ──────────────────────────────
  const filteredEvents = useMemo(() => {
    if (!data?.events) return []

    return data.events.filter((item) => {
      if (selectedSignalFilter !== 'ALL' && item.signal_type !== selectedSignalFilter) {
        return false
      }
      if (selectedSeverityFilter !== 'ALL' && item.severity !== selectedSeverityFilter) {
        return false
      }
      if (multiSignalOnly && !item.is_multi_signal) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesCase = String(item?.case_id || '').toLowerCase().includes(q)
        const matchesDetail = String(item?.detail || '').toLowerCase().includes(q)
        const matchesLabel = String(item?.signal_label || '').toLowerCase().includes(q)
        if (!matchesCase && !matchesDetail && !matchesLabel) return false
      }
      return true
    })
  }, [data?.events, selectedSignalFilter, selectedSeverityFilter, multiSignalOnly, searchQuery])

  // Custom Bar Tooltip for Decongested Activity Stream
  const renderBarTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const pt = payload[0]?.payload
    if (!pt) return null

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 z-50 min-w-[210px]">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-1">
          <span className="font-bold text-slate-100 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-sky-400" />
            {pt.date}
          </span>
          <span className="font-mono text-[11px] font-bold text-sky-400">
            {pt.displayTotal} event{pt.displayTotal !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-0.5">
          <span className="text-rose-400 font-medium">Critical: {pt.critical}</span>
          <span className="text-orange-400 font-medium">High: {pt.high}</span>
          <span className="text-amber-400 font-medium">Medium: {pt.medium}</span>
          <span className="text-sky-300 font-medium">Low: {pt.low}</span>
        </div>
        {pt.signal_counts && Object.keys(pt.signal_counts).length > 0 && (
          <div className="pt-1 border-t border-slate-700/60 text-[10px] text-slate-300">
            Vectors: {Object.entries(pt.signal_counts).map(([k, v]) => `${signalLabels[k] || k} (${v})`).join(', ')}
          </div>
        )}
        <div className="text-[9px] text-slate-400 italic pt-0.5">
          Click bar to inspect linked cases below
        </div>
      </div>
    )
  }

  // Custom Scatter Tooltip
  const renderScatterTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const pt = payload[0]?.payload
    if (!pt) return null

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1 z-50">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-100">{pt.signal_label}</span>
          <Badge
            variant="outline"
            className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 border"
            style={{ borderColor: pt.color, color: pt.color }}
          >
            {pt.severity}
          </Badge>
        </div>
        <div className="text-[11px] text-slate-400 font-mono">{pt.timeStr}</div>
        <div className="pt-1 border-t border-slate-700/60 flex items-center justify-between gap-4">
          <span className="text-slate-300">Statistical Deviation:</span>
          <span className="font-mono font-bold text-amber-400">+{(pt.z_score ?? 0).toFixed(1)}σ</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Case ID:</span>
          <span className="font-mono font-semibold text-sky-400">{pt.case_id}</span>
        </div>
        {pt.is_multi_signal && (
          <div className="pt-1 text-[10px] text-rose-400 font-medium">
            ⚠️ Concurrent Vectors: {pt.concurrent_signals.join(', ')}
          </div>
        )}
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-slate-200/60 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-slate-200/50 rounded-2xl animate-pulse" />
          <div className="h-96 bg-slate-200/50 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  const userRole = reviewer?.role?.toUpperCase() || ''
  const isCompanyWide = data?.portfolio_scope === 'COMPANY_WIDE' || userRole === 'ADMIN'

  // Summary Metrics
  const totalAnalyzed = data?.total_cases_analyzed || 0
  const multiFlagged = data?.multi_signal_flagged_cases || 0
  const totalRiskEvents = data?.events?.length || 0
  const criticalEvents = data?.events?.filter((e) => e.severity === 'CRITICAL').length || 0

  const signalsList = data?.signals_list || [
    'velocity_spike',
    'refund_anomaly',
    'ip_clustering',
    'settlement_gap'
  ]
  const signalLabels = data?.signal_labels || {
    velocity_spike: 'Velocity Spike',
    refund_anomaly: 'Refund Anomaly',
    ip_clustering: 'IP Clustering',
    settlement_gap: 'Settlement Gap'
  }

  return (
    <div className="space-y-8 pb-14">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 border-b border-slate-200/60 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-rose-50 text-rose-700 border-rose-200 font-bold text-[11px] tracking-wider uppercase"
            >
              Phase 9 • Behavioral Intelligence
            </Badge>
            <span className="text-xs font-mono text-slate-500">
              Scope: {isCompanyWide ? 'Organization (All Portfolios)' : `Portfolio ${data?.portfolio_scope}`}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2.5">
            <Flame className="h-7 w-7 text-rose-600" />
            Risk Center & Behavioral Vectors
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Co-occurrence intelligence, multi-signal fraud containment (Rule I1), and historical anomaly timelines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="text-xs font-semibold gap-1.5 bg-white shadow-xs text-slate-700 border-slate-200"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-rose-600' : 'text-slate-500'}`} />
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* ── Executive Summary KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Multi-Signal Flagged Cases (Rule I1) */}
        <Card className="bg-white/80 backdrop-blur-xl border border-rose-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-rose-400 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
                Rule I1 Multi-Signal Flags
              </span>
              <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-700 mt-2 font-mono">
              {multiFlagged}
            </div>
            <span className="text-[11px] text-rose-700/80 font-medium mt-1 block">
              ≥ 2 concurrent signals exceeding +2.5σ
            </span>
          </CardContent>
        </Card>

        {/* KPI 2: Total Analyzed Exceptions */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-sky-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Exceptions In Scope
              </span>
              <div className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
              {totalAnalyzed}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Evaluated against 14-day rolling baseline
            </span>
          </CardContent>
        </Card>

        {/* KPI 3: Critical Severity Triggers */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-amber-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Critical Severity Triggers
              </span>
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Flame className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600 mt-2 font-mono">
              {criticalEvents}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Immediate containment required
            </span>
          </CardContent>
        </Card>

        {/* KPI 4: Total Anomaly Events */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-emerald-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Fired Risk Signals
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
              {totalRiskEvents}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-1 block">
              Mapped to active forensic records
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Section: Task 9.1 Heatmap & Task 9.2 Timeline ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Task 9.1: Hand-built 4x4 Risk Signal Correlation Heatmap (5 cols) */}
        <Card className="lg:col-span-5 bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-3.5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                Signal Correlation Heatmap
              </CardTitle>
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 font-mono">
                Rule I1 (≥2 signals)
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hand-built co-occurrence matrix (signal × signal) showing pairwise multi-signal concurrency.
            </p>
          </CardHeader>
          <CardContent className="p-5">
            {/* Heatmap Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[320px]">
                {/* Column Headers */}
                <div className="grid grid-cols-5 gap-1.5 mb-1.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <div className="text-left font-mono pl-1">Vector</div>
                  <div title="Velocity Spike">Velocity</div>
                  <div title="Refund Anomaly">Refund</div>
                  <div title="IP Clustering">IP Clust</div>
                  <div title="Settlement Gap">Settle</div>
                </div>

                {/* Rows */}
                {data?.correlation_matrix?.map((row, rIdx) => (
                  <div key={rIdx} className="grid grid-cols-5 gap-1.5 mb-1.5 items-center">
                    {/* Row Header */}
                    <div className="text-[11px] font-semibold text-slate-700 truncate pr-1" title={row.label || ''}>
                      {(row.label || '').split(' ')[0] || '—'}
                    </div>

                    {/* Matrix Cells */}
                    {signalsList.map((colKey, cIdx) => {
                      const count = row[colKey] || 0
                      const isDiagonal = row.signal === colKey

                      // Calculate color intensity
                      let bgClass = 'bg-slate-50 text-slate-400 border-slate-200/60'
                      if (count > 0) {
                        if (isDiagonal) {
                          bgClass = 'bg-indigo-50 border-indigo-200 text-indigo-900 font-black'
                        } else if (count >= 5) {
                          bgClass = 'bg-rose-500 text-white font-black border-rose-600 shadow-xs'
                        } else if (count >= 2) {
                          bgClass = 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                        } else {
                          bgClass = 'bg-slate-100 border-slate-300 text-slate-700 font-medium'
                        }
                      }

                      return (
                        <div
                          key={cIdx}
                          onMouseEnter={() => setHoveredPair({ s1: row.label, s2: signalLabels[colKey] || colKey, count })}
                          onMouseLeave={() => setHoveredPair(null)}
                          className={`h-11 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 ${bgClass}`}
                        >
                          <span className="text-xs font-mono">{count}</span>
                          {isDiagonal && (
                            <span className="text-[8px] uppercase tracking-tighter opacity-70">Total</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Hover Explainer */}
            <div className="mt-4 pt-3 border-t border-slate-100 min-h-[44px]">
              {hoveredPair ? (
                <div className="text-xs bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700 flex items-center justify-between">
                  <div>
                    <span className="font-bold">{hoveredPair.s1}</span> &{' '}
                    <span className="font-bold">{hoveredPair.s2}</span>
                  </div>
                  <div className="font-mono font-bold text-rose-600">
                    {hoveredPair.count} co-occurrences
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 italic">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Hover over cells to inspect pairwise co-occurrence and Rule I1 escalation impact.
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-slate-100 border border-slate-300" />
                0 None
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-amber-100 border border-amber-300" />
                1-4 Moderate
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-rose-500" />
                ≥5 High Co-occurrence
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-indigo-100 border border-indigo-200" />
                Diagonal Total
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Task 9.2: Reimagined Risk Event Timeline & Temporal Clustering (7 cols) */}
        <Card className="lg:col-span-7 bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-slate-100 pb-3.5 space-y-3">
            {/* Title & View Switcher */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-600" />
                  Risk Event Timeline & Temporal Clustering
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Decongested daily frequency and behavioral signal density over time.
                </p>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 text-xs self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTimelineView('stream')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    timelineView === 'stream'
                      ? 'bg-white shadow-xs text-slate-900 font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Daily Stacked Activity Stream (Zero Overlap)"
                >
                  📊 Volume
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineView('swimlanes')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    timelineView === 'swimlanes'
                      ? 'bg-white shadow-xs text-slate-900 font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Discrete Swimlanes by Signal Vector"
                >
                  🧬 Swimlanes
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineView('scatter')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    timelineView === 'scatter'
                      ? 'bg-white shadow-xs text-slate-900 font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Decongested Jittered Points"
                >
                  🎯 Points
                </button>
              </div>
            </div>

            {/* Filter & Range Sub-Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {/* Time Range Selector */}
                <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-md border border-slate-200/80 text-[11px] font-mono font-semibold">
                  <button
                    type="button"
                    onClick={() => setTimelineRange('7D')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timelineRange === '7D' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    7D
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineRange('14D')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timelineRange === '14D' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    14D
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineRange('ALL')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timelineRange === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    All 45D
                  </button>
                </div>

                {/* Signal Filter Dropdown */}
                <select
                  value={timelineSignalFilter}
                  onChange={(e) => setTimelineSignalFilter(e.target.value)}
                  className="h-6.5 px-2 text-[11px] font-medium rounded-md border border-slate-200 bg-white text-slate-700 shadow-xs"
                >
                  <option value="ALL">All 4 Signal Vectors</option>
                  <option value="velocity_spike">Velocity Spike</option>
                  <option value="refund_anomaly">Refund Anomaly</option>
                  <option value="ip_clustering">IP Clustering</option>
                  <option value="settlement_gap">Settlement Gap</option>
                </select>
              </div>

              {/* Severity Legend */}
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-rose-600" />
                  Critical
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  High
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Medium
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  Low
                </span>
              </div>
            </div>

            {/* Quick Summary Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="bg-slate-50/80 p-2 rounded-lg border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Active Days</span>
                <span className="text-xs font-bold font-mono text-slate-700">
                  {timelineStats.activeDays} / {data?.timeline_summary?.length || 46}
                </span>
              </div>
              <div className="bg-slate-50/80 p-2 rounded-lg border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Peak Burst Day</span>
                <span className="text-xs font-bold font-mono text-rose-600" title={timelineStats.peakDate}>
                  {timelineStats.peakDate ? timelineStats.peakDate.slice(5) : 'N/A'} ({timelineStats.peakCount} ev)
                </span>
              </div>
              <div className="bg-slate-50/80 p-2 rounded-lg border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Multi-Vector Days</span>
                <span className="text-xs font-bold font-mono text-amber-600">
                  {timelineStats.multiDays} Rule I1
                </span>
              </div>
              <div className="bg-slate-50/80 p-2 rounded-lg border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Events in Scope</span>
                <span className="text-xs font-bold font-mono text-sky-600">
                  {filteredTimelineBuckets.reduce((acc, b) => acc + b.displayTotal, 0)} events
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 flex-1 flex flex-col justify-between">
            {/* VIEW 1: Stacked Activity Volume Stream (Zero Overlap) */}
            {timelineView === 'stream' && (
              <div className="w-full">
                {filteredTimelineBuckets.length > 0 ? (
                  <div className="w-full h-[250px]">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={filteredTimelineBuckets} margin={{ top: 15, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="formattedDate"
                          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                          interval={timelineRange === '7D' ? 0 : timelineRange === '14D' ? 1 : 4}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={renderBarTooltip} />
                        <Bar 
                          dataKey="critical" 
                          name="Critical" 
                          stackId="a" 
                          fill="#e11d48" 
                          radius={[0, 0, 0, 0]} 
                          className="cursor-pointer"
                          onClick={(entry: any) => {
                            const d = entry?.payload?.date || entry?.date
                            if (d) setActiveBucketDate(d === activeBucketDate ? null : d)
                          }}
                        />
                        <Bar 
                          dataKey="high" 
                          name="High" 
                          stackId="a" 
                          fill="#ea580c" 
                          radius={[0, 0, 0, 0]} 
                          className="cursor-pointer"
                          onClick={(entry: any) => {
                            const d = entry?.payload?.date || entry?.date
                            if (d) setActiveBucketDate(d === activeBucketDate ? null : d)
                          }}
                        />
                        <Bar 
                          dataKey="medium" 
                          name="Medium" 
                          stackId="a" 
                          fill="#d97706" 
                          radius={[0, 0, 0, 0]} 
                          className="cursor-pointer"
                          onClick={(entry: any) => {
                            const d = entry?.payload?.date || entry?.date
                            if (d) setActiveBucketDate(d === activeBucketDate ? null : d)
                          }}
                        />
                        <Bar 
                          dataKey="low" 
                          name="Low" 
                          stackId="a" 
                          fill="#38bdf8" 
                          radius={[3, 3, 0, 0]} 
                          className="cursor-pointer"
                          onClick={(entry: any) => {
                            const d = entry?.payload?.date || entry?.date
                            if (d) setActiveBucketDate(d === activeBucketDate ? null : d)
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
                    No risk events match current filters.
                  </div>
                )}
              </div>
            )}

            {/* VIEW 2: Discrete Signal Swimlanes (Categorical Matrix) */}
            {timelineView === 'swimlanes' && (
              <div className="w-full space-y-3 py-2">
                {signalsList.map((sigKey) => {
                  if (timelineSignalFilter !== 'ALL' && timelineSignalFilter !== sigKey) {
                    return null
                  }

                  const sigTotal = filteredTimelineBuckets.reduce(
                    (acc, b) => acc + (b.signal_counts?.[sigKey] || 0),
                    0
                  )

                  return (
                    <div key={sigKey} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: SIGNAL_COLOR_MAP[sigKey] || '#64748b' }}
                          />
                          <span className="font-bold text-slate-800">
                            {signalLabels[sigKey] || sigKey}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
                          {sigTotal} event{sigTotal !== 1 ? 's' : ''} in view
                        </Badge>
                      </div>

                      {/* Daily Discrete Slots */}
                      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 pt-0.5">
                        {filteredTimelineBuckets.map((bucket) => {
                          const count = bucket.signal_counts?.[sigKey] || 0
                          const isSelected = activeBucketDate === bucket.date

                          if (count === 0) {
                            return (
                              <div
                                key={bucket.date}
                                title={`${bucket.date}: 0 ${signalLabels[sigKey] || sigKey} events`}
                                className="flex-1 flex flex-col items-center justify-center h-8 min-w-[20px] rounded border border-transparent opacity-40 hover:opacity-80"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                              </div>
                            )
                          }

                          // Color based on highest severity in bucket
                          let pillColor = 'bg-sky-500 text-white border-sky-600'
                          if (bucket.critical_count > 0) pillColor = 'bg-rose-600 text-white border-rose-700 shadow-xs ring-1 ring-rose-300'
                          else if (bucket.high_count > 0) pillColor = 'bg-orange-500 text-white border-orange-600'
                          else if (bucket.medium_count > 0) pillColor = 'bg-amber-500 text-white border-amber-600'

                          return (
                            <button
                              key={bucket.date}
                              type="button"
                              onClick={() => setActiveBucketDate(isSelected ? null : bucket.date)}
                              title={`${bucket.date}: ${count} ${signalLabels[sigKey] || sigKey} event(s)`}
                              className={`flex-1 flex flex-col items-center justify-center h-8 min-w-[22px] rounded-lg border font-mono text-[11px] font-bold cursor-pointer transition-all hover:scale-110 ${pillColor} ${
                                isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                              }`}
                            >
                              {count}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* VIEW 3: Decongested Scatter (Jittered Points) */}
            {timelineView === 'scatter' && (
              <div className="w-full">
                {decongestedScatterData.length > 0 ? (
                  <div className="w-full h-[250px]">
                    <ResponsiveContainer width="100%" height={250}>
                      <ScatterChart margin={{ top: 15, right: 15, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="x"
                          type="number"
                          domain={['auto', 'auto']}
                          name="Date"
                          tickFormatter={(unixTime) => {
                            const d = new Date(unixTime)
                            return `${d.getMonth() + 1}/${d.getDate()}`
                          }}
                          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                        />
                        <YAxis
                          dataKey="y"
                          type="number"
                          domain={[0.5, 4.5]}
                          ticks={[1, 2, 3, 4]}
                          tickFormatter={(val) => {
                            if (Math.round(val) === 4) return 'Velocity'
                            if (Math.round(val) === 3) return 'Refund'
                            if (Math.round(val) === 2) return 'IP Clust'
                            if (Math.round(val) === 1) return 'Settle'
                            return ''
                          }}
                          tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <ZAxis dataKey="z" range={[35, 140]} name="Deviation" />
                        <Tooltip content={renderScatterTooltip} />
                        <Scatter name="Risk Events" data={decongestedScatterData}>
                          {decongestedScatterData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              fillOpacity={0.8}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              className="cursor-pointer transition-transform hover:scale-130"
                              onClick={() => setActiveBucketDate(entry.dateStr === activeBucketDate ? null : entry.dateStr)}
                            />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
                    No risk events in this scope.
                  </div>
                )}
              </div>
            )}

            {/* Pinned Day Inspector Drawer */}
            {activeBucketDate && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900 text-white text-xs border border-slate-800 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-sky-400" />
                    <span className="font-bold">Temporal Cluster Breakdown: {activeBucketDate}</span>
                    <Badge variant="outline" className="text-[10px] text-sky-400 border-sky-700">
                      {eventsForActiveDate.length} Cases Linked
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveBucketDate(null)}
                    className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                  {eventsForActiveDate.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: SEVERITY_COLORS[ev.severity] || '#64748b' }}
                        />
                        <span className="font-semibold text-slate-200">{ev.signal_label}</span>
                        <span className="font-mono text-slate-400">+{(ev.z_score ?? 0).toFixed(1)}σ</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/exceptions/${ev.case_id}`}
                          className="font-mono text-sky-400 hover:underline flex items-center gap-1"
                        >
                          {ev.case_id}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Explanatory Caption */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <span className="text-[11px] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                {timelineView === 'stream'
                  ? 'Stacked daily frequency eliminates visual overlap. Click any bar to inspect linked cases.'
                  : timelineView === 'swimlanes'
                  ? 'Discrete temporal slots separate vectors. Click any capsule to view case details.'
                  : 'Points are spaced with vertical lane distribution to eliminate overlapping blobs.'}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {filteredTimelineBuckets.reduce((acc, b) => acc + b.displayTotal, 0)} events plotted
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Task 9.3: Full Filterable Risk-Signal Registry ──────────────────── */}
      <Card className="bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" />
                Risk Signal Event Registry
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Full searchable history of all behavioral risk signals, trigger z-scores, and linked cases.
              </p>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search input */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search case, detail..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 pr-3 text-xs w-48 bg-white border-slate-200"
                />
              </div>

              {/* Signal Type Filter */}
              <select
                value={selectedSignalFilter}
                onChange={(e) => setSelectedSignalFilter(e.target.value)}
                className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-1 focus:ring-slate-400"
              >
                <option value="ALL">All Signals</option>
                <option value="velocity_spike">Velocity Spike</option>
                <option value="refund_anomaly">Refund Anomaly</option>
                <option value="ip_clustering">IP Clustering</option>
                <option value="settlement_gap">Settlement Gap</option>
              </select>

              {/* Severity Filter */}
              <select
                value={selectedSeverityFilter}
                onChange={(e) => setSelectedSeverityFilter(e.target.value)}
                className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-1 focus:ring-slate-400"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {/* Multi-Signal Toggle */}
              <button
                type="button"
                onClick={() => setMultiSignalOnly(!multiSignalOnly)}
                className={`h-8 px-3 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
                  multiSignalOnly
                    ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="h-3 w-3 text-rose-500" />
                Multi-Signal (Rule I1)
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Trigger Timestamp</th>
                  <th className="py-3 px-4">Risk Signal</th>
                  <th className="py-3 px-4 text-center">Severity</th>
                  <th className="py-3 px-4 text-right">Z-Score</th>
                  <th className="py-3 px-4">Forensic Detail</th>
                  <th className="py-3 px-4">Associated Case</th>
                  <th className="py-3 px-4 text-center">Rule I1 Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.length > 0 ? (
                  filteredEvents.map((ev) => {
                    const signalColor = SIGNAL_COLOR_MAP[ev.signal_type] || '#64748b'
                    const isCritical = ev.severity === 'CRITICAL'
                    const isHigh = ev.severity === 'HIGH'

                    return (
                      <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Timestamp */}
                        <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTime(ev.timestamp)}
                        </td>

                        {/* Signal Type */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: signalColor }}
                            />
                            <span className="font-bold text-slate-900">{ev.signal_label}</span>
                          </div>
                        </td>

                        {/* Severity */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <Badge
                            variant={isCritical ? 'destructive' : isHigh ? 'warning' : 'outline'}
                            className="text-[9px] uppercase tracking-wider font-bold"
                          >
                            {ev.severity}
                          </Badge>
                        </td>

                        {/* Z-Score */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 whitespace-nowrap">
                          +{(ev.z_score ?? 0).toFixed(1)}σ
                        </td>

                        {/* Forensic Detail */}
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={ev.detail}>
                          {ev.detail}
                        </td>

                        {/* Associated Case */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link
                            to={`/exceptions/${ev.case_id}`}
                            className="inline-flex items-center gap-1 font-mono text-sky-600 hover:text-sky-800 hover:underline font-semibold"
                          >
                            <span>{ev.case_id}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>

                        {/* Multi-Signal Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {ev.is_multi_signal ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-rose-50 text-rose-700 border-rose-200 font-bold uppercase tracking-wider"
                              title={`Concurrent signals: ${ev.concurrent_signals.join(', ')}`}
                            >
                              Flagged ({ev.concurrent_signals.length})
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">Isolated</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center">
                        <Info className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">No risk events match your filter criteria.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 px-4">
            <span>
              Showing {filteredEvents.length} of {data?.events?.length || 0} risk events
            </span>
            <span className="font-mono text-[10px]">
              Multi-signal threshold: ≥ 2 concurrent vectors &gt; 2.5σ
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
