import { useEffect, useState, useMemo } from 'react'
import { Card, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { 
  ResponsiveContainer, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  Legend, 
  Tooltip as RechartsTooltip,
  Treemap 
} from 'recharts'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'
import { AnimatedCounter } from '../components/ui/animated-counter'
import { 
  Compass, 
  Activity, 
  Grid, 
  Layers, 
  TrendingUp, 
  AlertTriangle, 
  IndianRupee, 
  Calendar as CalendarIcon,
  Filter,
  Info
} from 'lucide-react'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface RadarScore {
  health_rate: number
  resolution_speed: number
  case_freshness: number
  fee_integrity: number
  raw_metrics?: {
    health_rate: number
    avg_res_hours: number
    avg_age_days: number
    leakage_rate: number
  }
}

interface PortfolioRadarItem {
  portfolio_id: string
  scores: RadarScore
}

interface RadarDataResponse {
  portfolio_scope: string
  company_average: {
    portfolio_id: string
    scores: RadarScore
  }
  portfolios: PortfolioRadarItem[]
}

interface TreemapItem {
  name: string
  count: number
  delta_inr: number
  unresolved_delta_inr: number
  severity: string
  fill: string
  value?: number
}

interface TreemapResponse {
  range: string
  total_cases: number
  total_leakage_inr: number
  items: TreemapItem[]
}

interface DailyActivityItem {
  date: string
  cases_opened: number
  cases_resolved: number
  unresolved_cases: number
  health_rate: number
  opened_delta_inr: number
  resolved_delta_inr: number
}

interface DailyActivityResponse {
  days: number
  portfolio_scope: string
  total_opened: number
  total_resolved: number
  daily_activity: DailyActivityItem[]
}

interface BridgeResponse {
  total_expected_inr: number
  total_actual_inr: number
  net_variance_inr: number
}

export default function Insights() {
  const { reviewer } = useAuthStore()
  const [loading, setLoading] = useState(true)

  // Filter states
  const [range, setRange] = useState('90d')
  const [treemapMetric, setTreemapMetric] = useState<'count' | 'delta'>('count')

  // API Data
  const [radarData, setRadarData] = useState<RadarDataResponse | null>(null)
  const [treemapData, setTreemapData] = useState<TreemapResponse | null>(null)
  const [activityData, setActivityData] = useState<DailyActivityResponse | null>(null)
  const [bridgeData, setBridgeData] = useState<BridgeResponse | null>(null)

  // Hovered day tooltip for calendar heatmap
  const [hoveredDay, setHoveredDay] = useState<DailyActivityItem | null>(null)

  const userRole = reviewer?.role?.toUpperCase() || ''

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true)
      try {
        const results = await Promise.allSettled([
          api.get('/api/analytics/portfolio-radar'),
          api.get(`/api/analytics/treemap?range=${range}`),
          api.get(`/api/analytics/daily-activity?days=90`),
          api.get(`/api/analytics/bridge?range=${range}`)
        ])

        if (results[0].status === 'fulfilled') setRadarData(results[0].value.data)
        if (results[1].status === 'fulfilled') setTreemapData(results[1].value.data)
        if (results[2].status === 'fulfilled') setActivityData(results[2].value.data)
        if (results[3].status === 'fulfilled') setBridgeData(results[3].value.data)
      } catch (err) {
        console.error('Failed to load insights telemetry', err)
      } finally {
        setLoading(false)
      }
    }

    fetchInsights()
  }, [range])

  // ── Task 7.1: Transform Radar Data for Recharts RadarChart ──────────────────
  const radarChartData = useMemo(() => {
    if (!radarData) return []
    const metrics = [
      { key: 'health_rate', label: 'Health Rate' },
      { key: 'resolution_speed', label: 'Resolution Speed' },
      { key: 'case_freshness', label: 'Case Freshness' },
      { key: 'fee_integrity', label: 'Fee Integrity' },
    ]

    return metrics.map((m) => {
      const row: Record<string, any> = {
        metric: m.label,
        company_average: radarData.company_average?.scores?.[m.key as keyof RadarScore] ?? 0,
      }
      ;(radarData.portfolios || []).forEach((p) => {
        row[p.portfolio_id] = p?.scores?.[m.key as keyof RadarScore] ?? 0
      })
      return row
    })
  }, [radarData])

  // Radar chart colors for distinct portfolios
  const radarColors = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

  // ── Task 7.2: Transform Treemap Data ─────────────────────────────────────────
  const formattedTreemapData = useMemo(() => {
    if (!treemapData || !treemapData.items) return []
    const rawValues = treemapData.items.map((i) =>
      treemapMetric === 'count' ? i.count : Math.abs(i.delta_inr)
    )
    const maxVal = Math.max(1, ...rawValues)
    // Sizing threshold: scale small items so they maintain a legible card footprint rather than thin slivers
    const minWeight = Math.max(1, Math.round(maxVal * 0.08))

    return treemapData.items.map((item) => {
      const raw = treemapMetric === 'count' ? item.count : Math.abs(item.delta_inr)
      return {
        ...item,
        value: Math.max(minWeight, raw || 1),
      }
    })
  }, [treemapData, treemapMetric])

  // Dynamic subtle & professional palette mapping by severity for clean fintech surface
  const getSeverityTheme = (sev: string = '') => {
    switch (String(sev || '').toUpperCase()) {
      case 'CRITICAL':
        return {
          accent: '#e11d48',
          tagBg: '#ffe4e6',
          tagBorder: '#fecdd3',
          tagText: '#be123c',
        }
      case 'HIGH':
        return {
          accent: '#d97706',
          tagBg: '#fef3c7',
          tagBorder: '#fde68a',
          tagText: '#b45309',
        }
      case 'MEDIUM':
        return {
          accent: '#2563eb',
          tagBg: '#eff6ff',
          tagBorder: '#bfdbfe',
          tagText: '#1d4ed8',
        }
      case 'LOW':
        return {
          accent: '#059669',
          tagBg: '#ecfdf5',
          tagBorder: '#a7f3d0',
          tagText: '#047857',
        }
      default: // INFO or fallback
        return {
          accent: '#64748b',
          tagBg: '#f1f5f9',
          tagBorder: '#e2e8f0',
          tagText: '#475569',
        }
    }
  }

  // Format snake_case exception code into clean, readable Title Case
  const formatExceptionName = (code: string = '') => {
    if (!code) return ''
    return String(code)
      .split('_')
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ''))
      .join(' ')
  }

  // Custom Treemap Content Renderer: Clean White Fintech Cards, Guaranteed Solid Black Text, Zero Overlap
  const renderCustomTreemapContent = (props: any) => {
    const { x, y, width, height, depth } = props
    // Ignore root node (depth 0) and tiny boxes
    if (depth === 0 || !width || !height || width < 4 || height < 4) return <g />

    // Robust property resolution from either props directly or props.payload
    const rawName = props.name || props.payload?.name || ''
    const count = props.count ?? props.payload?.count ?? 0
    const delta_inr = props.delta_inr ?? props.payload?.delta_inr ?? 0
    const severity = (props.severity || props.payload?.severity || 'MEDIUM').toUpperCase()

    const theme = getSeverityTheme(severity)
    const formattedName = formatExceptionName(rawName)
    const metricText = treemapMetric === 'count'
      ? `${count} cases`
      : `₹${Math.abs(Math.round(delta_inr)).toLocaleString()}`

    // Calculate space for text (padding 10px from left accent bar, 6px from right edge)
    const textLeft = x + 10
    const usableWidth = Math.max(0, width - 16)
    const usableHeight = Math.max(0, height - 4)

    // Accurate character cutoff so text NEVER overflows or overlaps adjacent boxes
    const approxCharWidth = 6.6
    const maxChars = Math.max(0, Math.floor(usableWidth / approxCharWidth))
    const truncatedName = formattedName.length > maxChars
      ? (maxChars > 3 ? `${formattedName.slice(0, maxChars - 1)}…` : formattedName.slice(0, maxChars))
      : formattedName

    const truncatedMetric = metricText.length > maxChars
      ? (maxChars > 3 ? `${metricText.slice(0, maxChars - 1)}…` : metricText.slice(0, maxChars))
      : metricText

    // Adaptive visibility:
    const showTitle = usableWidth >= 34 && usableHeight >= 20
    const showMetric = usableWidth >= 28 && usableHeight >= 38
    const showBadge = usableWidth >= 50 && usableHeight >= 58
    // Never leave any block empty: fallback displays the count/amount cleanly centered
    const showCompactMetric = !showTitle && width >= 12 && height >= 12

    const solidBlackStyle: React.CSSProperties = {
      fill: '#000000',
      stroke: 'none',
      color: '#000000',
      opacity: 1,
      paintOrder: 'fill',
      pointerEvents: 'none',
      userSelect: 'none',
    }

    return (
      <g className="transition-all">
        {/* Native SVG tooltip on hover */}
        <title>
          {`${formattedName} (${severity})\n${count} cases • ₹${Math.abs(Math.round(delta_inr)).toLocaleString()}`}
        </title>

        {/* Clean White Card Base matching Fintech Environment */}
        <rect
          x={x + 1}
          y={y + 1}
          width={Math.max(0, width - 2)}
          height={Math.max(0, height - 2)}
          rx={6}
          ry={6}
          fill="#ffffff"
          stroke="#cbd5e1"
          strokeWidth={1}
          className="transition-colors hover:fill-slate-50 cursor-pointer"
        />

        {/* Subtle Left Accent Stripe indicating Severity */}
        <rect
          x={x + 1}
          y={y + 1}
          width={4}
          height={Math.max(0, height - 2)}
          rx={2}
          fill={theme.accent}
          style={{ pointerEvents: 'none' }}
        />

        {/* Title: Solid Black, stroke none */}
        {showTitle && (
          <text
            x={textLeft}
            y={y + (showMetric ? 17 : usableHeight / 2 + 5)}
            fill="#000000"
            stroke="none"
            fontSize="11px"
            fontWeight="700"
            letterSpacing="-0.01em"
            className="treemap-tile-text"
            style={solidBlackStyle}
          >
            {truncatedName}
          </text>
        )}

        {/* Metric Value: Solid Black, stroke none */}
        {showMetric && (
          <text
            x={textLeft}
            y={y + 33}
            fill="#000000"
            stroke="none"
            fontSize="10px"
            fontWeight="600"
            fontFamily="monospace"
            className="treemap-tile-text"
            style={solidBlackStyle}
          >
            {truncatedMetric}
          </text>
        )}

        {/* Severity Tag Badge: Solid Black text */}
        {showBadge && (
          <g transform={`translate(${textLeft}, ${y + 44})`} style={{ pointerEvents: 'none' }}>
            <rect
              x={0}
              y={0}
              width={Math.min(usableWidth, (severity.length * 5.8) + 12)}
              height={15}
              rx={3}
              fill={theme.tagBg}
              stroke={theme.tagBorder}
              strokeWidth={0.5}
            />
            <text
              x={6}
              y={11}
              fill="#000000"
              stroke="none"
              fontSize="8.5px"
              fontWeight="700"
              letterSpacing="0.04em"
              className="treemap-tile-text"
              style={solidBlackStyle}
            >
              {severity}
            </text>
          </g>
        )}

        {/* Compact Metric for Narrow Tiles: Solid Black */}
        {showCompactMetric && (
          <text
            x={x + width / 2 + 1}
            y={y + height / 2 + 4}
            textAnchor="middle"
            fill="#000000"
            stroke="none"
            fontSize={Math.min(11, Math.max(9, Math.floor(width * 0.45)))}
            fontWeight="700"
            fontFamily="monospace"
            className="treemap-tile-text"
            style={solidBlackStyle}
          >
            {treemapMetric === 'count' ? `${count}` : `₹${Math.round(Math.abs(delta_inr) / 1000)}k`}
          </text>
        )}
      </g>
    )
  }

  // ── Task 7.3: Calendar Heatmap Helper ────────────────────────────────────────
  // Group 90 days into columns of weeks (7 days per week)
  const calendarWeeks = useMemo(() => {
    if (!activityData || !activityData.daily_activity) return []
    const days = activityData.daily_activity
    const weeks: DailyActivityItem[][] = []
    let currentWeek: DailyActivityItem[] = []

    days.forEach((day, index) => {
      currentWeek.push(day)
      if (currentWeek.length === 7 || index === days.length - 1) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    })

    return weeks
  }, [activityData])

  const getHeatmapColor = (day: DailyActivityItem) => {
    if (day.cases_opened === 0 && day.cases_resolved === 0) {
      return 'bg-slate-100 hover:bg-slate-200 border-slate-200/80'
    }
    if (day.health_rate >= 95) {
      return 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white'
    }
    if (day.health_rate >= 80) {
      return 'bg-emerald-400 hover:bg-emerald-500 border-emerald-500 text-white'
    }
    if (day.health_rate >= 60) {
      return 'bg-amber-400 hover:bg-amber-500 border-amber-500 text-white'
    }
    return 'bg-rose-500 hover:bg-rose-600 border-rose-600 text-white'
  }

  // ── Headline KPI Values for Task 7.4 Animated Counters ───────────────────────
  const overallHealthRate = useMemo(() => {
    if (!activityData || activityData.total_opened === 0) return 100.0
    return Math.round((activityData.total_resolved / activityData.total_opened) * 1000) / 10
  }, [activityData])

  const expectedNetInr = bridgeData?.total_expected_inr || 0
  const totalCasesCount = activityData?.total_opened || treemapData?.total_cases || 0
  const totalLeakageInr = treemapData?.total_leakage_inr || 0

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200/50 rounded-2xl animate-pulse" />
          <div className="h-80 bg-slate-200/50 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 border-b border-slate-200/60 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 font-bold text-[11px] tracking-wider uppercase">
              Phase 7 • Visual Intelligence
            </Badge>
            <span className="text-xs font-mono text-slate-500">
              Scope: {radarData?.portfolio_scope === 'COMPANY_WIDE' ? 'Organization (All Portfolios)' : `Portfolio ${radarData?.portfolio_scope}`}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2.5">
            <Compass className="h-7 w-7 text-sky-600" />
            Insights & Visual Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 font-medium">
            Multi-dimensional radar comparisons, proportional treemaps, calendar heatmaps, and real-time telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/80 border border-slate-200/80 rounded-xl p-1 shadow-sm">
            <Filter className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none pr-2 py-0.5 cursor-pointer"
            >
              <option value="30d">Trailing 30 Days</option>
              <option value="60d">Trailing 60 Days</option>
              <option value="90d">Trailing 90 Days</option>
              <option value="180d">Trailing 180 Days</option>
              <option value="1y">Trailing 1 Year</option>
            </select>
          </div>

          {userRole && (
            <Badge 
              variant={userRole === 'ADMIN' ? 'success' : 'outline'}
              className="font-mono text-[10px] uppercase px-2.5 py-1"
            >
              {userRole} • {reviewer?.portfolio_id || 'GLOBAL'}
            </Badge>
          )}
        </div>
      </div>

      {/* Task 7.4 — Animated KPI Headline Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Overall Health Rate */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative p-5 hover:shadow-md transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Health Rate</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-3xl font-black text-emerald-600 mt-3 font-mono">
              <AnimatedCounter value={overallHealthRate} decimals={1} suffix="%" duration={1200} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {activityData?.total_resolved || 0} of {activityData?.total_opened || 0} exceptions resolved cleanly.
            </p>
          </div>
        </Card>

        {/* KPI 2: Expected Net Settlement */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative p-5 hover:shadow-md transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expected Net Settlement</span>
              <IndianRupee className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 mt-3 font-mono truncate">
              <AnimatedCounter value={expectedNetInr} decimals={2} prefix="₹" duration={1200} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Gross clearing inflow before fee deductions and adjustments.
            </p>
          </div>
        </Card>

        {/* KPI 3: Total Exception Volume */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative p-5 hover:shadow-md transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Discrepancies</span>
              <Layers className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-3xl font-black text-purple-700 mt-3 font-mono">
              <AnimatedCounter value={totalCasesCount} decimals={0} suffix=" cases" duration={1000} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Captured across reconciliation and settlement pipelines.
            </p>
          </div>
        </Card>

        {/* KPI 4: Capital at Leakage Risk */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative p-5 hover:shadow-md transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Variance & Leakage</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-black text-rose-600 mt-3 font-mono truncate">
              <AnimatedCounter value={totalLeakageInr} decimals={2} prefix="₹" duration={1200} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Net cumulative delta across all classified exception clusters.
            </p>
          </div>
        </Card>
      </div>

      {/* ── Task 7.1: Portfolio Radar & Task 7.2: Exception Treemap ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task 7.1: Portfolio Radar Chart */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative flex flex-col">
          <div className="p-6 space-y-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200/40 pb-3">
              <div>
                <Badge variant="outline" className="text-[9px] font-mono bg-sky-50 text-sky-700 border-sky-200 uppercase">
                  Task 7.1 • Multi-Axis Radar
                </Badge>
                <CardTitle className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-sky-600" />
                  Portfolio Operational Radar
                </CardTitle>
              </div>
              <span className="text-xs font-mono text-slate-400">Scale 0 - 100</span>
            </div>

            <p className="text-xs text-slate-500">
              Comparing portfolios across 4 normalized operational pillars: Health Rate, Resolution Speed, Case Freshness, and Fee Integrity.
            </p>

            <div className="w-full min-h-[350px] h-[350px] pt-2 relative">
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart cx="50%" cy="46%" outerRadius="60%" data={radarChartData} margin={{ top: 10, right: 35, bottom: 20, left: 35 }}>
                  <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
                  <PolarAngleAxis 
                    dataKey="metric" 
                    stroke="#475569" 
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }} 
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#94a3b8" fontSize={9} />
                  
                  {/* Benchmark: Company Average */}
                  <Radar
                    name="Company Average"
                    dataKey="company_average"
                    stroke="#94a3b8"
                    fill="#94a3b8"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />

                  {/* Individual Portfolios */}
                  {radarData?.portfolios.map((p, idx) => {
                    const color = radarColors[idx % radarColors.length]
                    return (
                      <Radar
                        key={p.portfolio_id}
                        name={p.portfolio_id}
                        dataKey={p.portfolio_id}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.35}
                        strokeWidth={2}
                      />
                    )
                  })}

                  <Legend 
                    verticalAlign="bottom" 
                    align="center" 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '16px', paddingBottom: '4px' }} 
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Tenant IDOR Scoping Active</span>
              <span>{radarData?.portfolios.length} portfolio profile(s) mapped</span>
            </div>
          </div>
        </Card>

        {/* Task 7.2: Exception Code Treemap */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative flex flex-col">
          <div className="p-6 space-y-3 flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200/40 pb-3 gap-2">
              <div>
                <Badge variant="outline" className="text-[9px] font-mono bg-purple-50 text-purple-700 border-purple-200 uppercase">
                  Task 7.2 • Proportional Cluster
                </Badge>
                <CardTitle className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
                  <Grid className="h-5 w-5 text-purple-600" />
                  Exception Code Treemap
                </CardTitle>
              </div>

              {/* Sizing Toggle: By Count vs By Financial Impact */}
              <div className="flex items-center bg-slate-100/90 rounded-lg p-0.5 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setTreemapMetric('count')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    treemapMetric === 'count'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  By Case Count
                </button>
                <button
                  type="button"
                  onClick={() => setTreemapMetric('delta')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    treemapMetric === 'delta'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  By Financial Impact (₹)
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Proportional distribution of exception codes sized by {treemapMetric === 'count' ? 'case volume' : 'financial impact'} and colored by severity level.
            </p>

            <div className="w-full min-h-[350px] h-[350px] pt-2 relative">
              {formattedTreemapData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No exception code data available for this range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <Treemap
                    key={`treemap-${treemapMetric}-${range}-${formattedTreemapData.length}`}
                    data={formattedTreemapData}
                    dataKey="value"
                    aspectRatio={1.6}
                    stroke="none"
                    fill="none"
                    content={renderCustomTreemapContent}
                  />
                </ResponsiveContainer>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                  <span className="text-[10px] text-slate-600 font-semibold">Critical</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-[10px] text-slate-600 font-semibold">High</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                  <span className="text-[10px] text-slate-600 font-semibold">Medium</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
                  <span className="text-[10px] text-slate-600 font-semibold">Low/Info</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {formattedTreemapData.length} Anomaly Types
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Task 7.3: Calendar Heatmap (GitHub Contribution Style) ─────────── */}
      <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
        <div className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200/40 pb-4 gap-2">
            <div>
              <Badge variant="outline" className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200 uppercase">
                Task 7.3 • 90-Day Continuous Grid
              </Badge>
              <CardTitle className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-emerald-600" />
                Operational Health Calendar Heatmap
              </CardTitle>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Less</span>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-[3px] bg-slate-100 border border-slate-200" title="No activity" />
                <span className="w-3 h-3 rounded-[3px] bg-rose-500" title="<60% Health" />
                <span className="w-3 h-3 rounded-[3px] bg-amber-400" title="60-79% Health" />
                <span className="w-3 h-3 rounded-[3px] bg-emerald-400" title="80-94% Health" />
                <span className="w-3 h-3 rounded-[3px] bg-emerald-500" title="≥95% Health" />
              </div>
              <span>More / Healthy</span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Daily reconciliation throughput over the trailing 90 days. Each cell indicates the day's match and resolution health rate. Hover to inspect day details.
          </p>

          {/* GitHub-style Heatmap Grid (Weeks across X, 7 days down Y) */}
          <div className="overflow-x-auto pb-2">
            <div className="inline-flex gap-1.5 p-2 bg-white/60 rounded-xl border border-slate-200/60 shadow-inner">
              {calendarWeeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1.5">
                  {week.map((day) => (
                    <div
                      key={day.date}
                      onMouseEnter={() => setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[4px] border transition-all cursor-pointer ${getHeatmapColor(
                        day
                      )}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Hover Details Card */}
          <div className="min-h-[42px] p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-center justify-between text-xs font-mono">
            {hoveredDay ? (
              <div className="flex flex-wrap items-center gap-4 text-slate-800">
                <span className="font-bold text-slate-900">{hoveredDay.date}</span>
                <span>
                  Health Rate: <strong className={hoveredDay.health_rate < 80 ? 'text-rose-600' : 'text-emerald-600'}>{hoveredDay.health_rate}%</strong>
                </span>
                <span>Opened: <strong>{hoveredDay.cases_opened}</strong></span>
                <span>Resolved: <strong>{hoveredDay.cases_resolved}</strong></span>
                <span>Unresolved Delta: <strong>₹{(hoveredDay.opened_delta_inr ?? 0).toLocaleString()}</strong></span>
              </div>
            ) : (
              <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                <Info className="h-3.5 w-3.5" />
                Hover over any cell in the 90-day activity matrix to inspect daily reconciliation telemetry.
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
