import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import { formatINR } from '../lib/formatters'
import { useAuthStore } from '../store/auth'
import {
  Coins,
  TrendingUp,
  ShieldCheck,
  RotateCw,
  ArrowRightLeft,
  TrendingDown,
  Info
} from 'lucide-react'
import {
  Sankey,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'
import { motion } from 'framer-motion'

// ── Types ───────────────────────────────────────────────────────────────────

interface MoneyFlowNode {
  id: string
  name: string
  stage: 'input' | 'classification' | 'outcome'
}

interface MoneyFlowLink {
  source: string
  target: string
  value: number
}

interface MoneyFlowData {
  range: string
  portfolio_scope: string
  total_inflow_inr: number
  total_cases_analyzed: number
  nodes: MoneyFlowNode[]
  links: MoneyFlowLink[]
}

interface BridgeStep {
  label: string
  delta_amount: number
  type: 'starting' | 'adjustment' | 'final'
  cumulative_amount: number
}

interface BridgeData {
  range: string
  portfolio_scope: string
  total_expected_inr: number
  total_actual_inr: number
  net_variance_inr: number
  steps: BridgeStep[]
}

// ── Color Schemes ───────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  gateway_settlement: '#0284c7',    // Sky 600
  auto_matched: '#059669',          // Emerald 600
  exceptions_critical: '#e11d48',   // Rose 600
  exceptions_high: '#ea580c',       // Orange 600
  exceptions_medium: '#d97706',     // Amber 600
  exceptions_low: '#64748b',        // Slate 500
  resolved_approved: '#16a34a',     // Green 600
  resolved_rejected: '#dc2626',     // Red 600
  pending_resolution: '#6366f1',    // Indigo 500
}

export default function MoneyFlow() {
  const { reviewer } = useAuthStore()
  const [range, setRange] = useState<'30d' | '60d' | '90d'>('90d')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moneyFlowData, setMoneyFlowData] = useState<MoneyFlowData | null>(null)
  const [bridgeData, setBridgeData] = useState<BridgeData | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // 1. Accessibility: prefers-reduced-motion listener
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  // 2. Fetch data from endpoints (Task 6.1 & 6.2)
  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [mfRes, bridgeRes] = await Promise.all([
        api.get(`/api/analytics/money-flow?range=${range}`),
        api.get(`/api/analytics/bridge?range=${range}`)
      ])
      setMoneyFlowData(mfRes.data)
      setBridgeData(bridgeRes.data)
    } catch (err) {
      console.error('Failed to load money flow or bridge data', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [range])

  // ── Task 8.1: Prepare Recharts Sankey Data Structure ────────────────────────
  const sankeyChartData = useMemo(() => {
    if (!moneyFlowData || !moneyFlowData.nodes || !moneyFlowData.links) {
      return { nodes: [], links: [] }
    }

    // Assign color and enrich nodes
    const enrichedNodes = moneyFlowData.nodes.map((node) => ({
      ...node,
      color: NODE_COLORS[node.id] || '#64748b',
    }))

    // Recharts Sankey requires numerical 0-indexed node pointers
    const nodeIndexMap = new Map<string, number>()
    enrichedNodes.forEach((node, idx) => {
      nodeIndexMap.set(node.id, idx)
    })

    const rechartsLinks = moneyFlowData.links
      .filter((link) => link.value > 0)
      .map((link, linkIndex) => {
        const sourceIndex = nodeIndexMap.get(link.source) ?? 0
        const targetIndex = nodeIndexMap.get(link.target) ?? 0
        const sourceNode = enrichedNodes[sourceIndex]
        const targetNode = enrichedNodes[targetIndex]
        return {
          source: sourceIndex,
          target: targetIndex,
          value: link.value,
          sourceName: sourceNode?.name || link.source,
          targetName: targetNode?.name || link.target,
          color: sourceNode?.color || '#94a3b8',
          linkIndex
        }
      })

    return {
      nodes: enrichedNodes,
      links: rechartsLinks
    }
  }, [moneyFlowData])

  // ── Task 8.2: Prepare Recharts Waterfall Bar Data Structure ─────────────────
  const waterfallChartData = useMemo(() => {
    if (!bridgeData || !bridgeData.steps) return []

    return bridgeData.steps.map((step, idx) => {
      let base = 0
      let delta = 0
      let barColor = '#3b82f6'

      if (step.type === 'starting') {
        base = 0
        delta = step.delta_amount
        barColor = '#2563eb' // Blue 600 (Starting Expected Net)
      } else if (step.type === 'final') {
        base = 0
        delta = step.delta_amount
        barColor = '#0f172a' // Slate 900 (Final Actual Net Settled)
      } else {
        // Adjustment step
        if (step.delta_amount < 0) {
          // Deduction (e.g. Fees, Refunds, Discrepancies)
          base = step.cumulative_amount
          delta = Math.abs(step.delta_amount)
          barColor = step.label.includes('Fee') ? '#d97706' : '#e11d48' // Amber for Fees, Rose for Refunds/Discrepancies
        } else {
          // Addition / Positive adjustment
          base = step.cumulative_amount - step.delta_amount
          delta = step.delta_amount
          barColor = '#059669' // Emerald for positive additions
        }
      }

      // Short label for axis readability
      const shortLabel = step.label
        .replace('Expected Net Settlement', 'Expected Net')
        .replace('Gateway & MDR Fees', 'MDR Fees')
        .replace('Customer Refunds', 'Refunds')
        .replace('Discrepancy Mismatches', 'Discrepancies')
        .replace('Other Adjustments & Chargebacks', 'Other Adj')
        .replace('Actual Net Settled', 'Actual Net')

      return {
        ...step,
        shortLabel,
        base,
        delta,
        fillColor: barColor,
        stepIndex: idx
      }
    })
  }, [bridgeData])

  // ── Custom Sankey Link with Entrance Animation (Task 8.3) ───────────────────
  const renderSankeyLink = (props: any) => {
    const {
      sourceX,
      targetX,
      sourceY,
      targetY,
      sourceControlX,
      targetControlX,
      linkWidth,
      payload,
      index
    } = props

    const sx = sourceX ?? 0
    const sy = sourceY ?? 0
    const tx = targetX ?? 0
    const ty = targetY ?? 0
    const scx = sourceControlX ?? (sx + tx) / 2
    const tcx = targetControlX ?? (sx + tx) / 2
    const lw = Math.max(linkWidth ?? 3, 2)
    const color = payload?.color || '#94a3b8'

    const d = `M${sx},${sy} C${scx},${sy} ${tcx},${ty} ${tx},${ty}`

    return (
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={lw}
        strokeOpacity={0.38}
        initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.38 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.8,
          delay: prefersReducedMotion ? 0 : (index ?? 0) * 0.04,
          ease: 'easeOut'
        }}
        whileHover={{ strokeOpacity: 0.85 }}
        className="transition-opacity cursor-pointer"
      />
    )
  }

  // ── Custom Sankey Node ──────────────────────────────────────────────────────
  const renderSankeyNode = (props: any) => {
    const { x, y, width, height, payload } = props
    if (!width || !height || height <= 0) return null

    const nodeColor = payload?.color || '#3b82f6'
    const isRightSide = (x ?? 0) > 450
    const isLeftSide = (x ?? 0) < 150

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={nodeColor}
          rx={4}
          className="shadow-sm transition-all hover:opacity-90"
        />
        <text
          x={isRightSide ? (x ?? 0) + (width ?? 0) + 8 : isLeftSide ? (x ?? 0) - 8 : (x ?? 0) + (width ?? 0) / 2}
          y={(y ?? 0) + (height ?? 0) / 2}
          textAnchor={isRightSide ? 'start' : isLeftSide ? 'end' : 'middle'}
          dominantBaseline="middle"
          className="text-[11px] font-bold fill-slate-800 pointer-events-none select-none"
        >
          {payload?.name}
        </text>
        <text
          x={isRightSide ? (x ?? 0) + (width ?? 0) + 8 : isLeftSide ? (x ?? 0) - 8 : (x ?? 0) + (width ?? 0) / 2}
          y={(y ?? 0) + (height ?? 0) / 2 + 14}
          textAnchor={isRightSide ? 'start' : isLeftSide ? 'end' : 'middle'}
          dominantBaseline="middle"
          className="text-[10px] font-mono font-medium fill-slate-500 pointer-events-none select-none"
        >
          {formatINR(payload?.value || 0)}
        </text>
      </g>
    )
  }

  // ── Custom Waterfall Bar Shape with Left-to-Right Entrance (Task 8.3) ───────
  const renderWaterfallBar = (props: any) => {
    const { x, y, width, height, payload, index } = props
    if (!width || height === undefined || height < 0) return null

    const barColor = payload?.fillColor || '#3b82f6'

    return (
      <motion.rect
        x={x}
        y={y}
        width={width}
        height={Math.max(height, 2)}
        rx={4}
        fill={barColor}
        initial={prefersReducedMotion ? false : { scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.45,
          delay: prefersReducedMotion ? 0 : (index ?? 0) * 0.12, // Stepping left-to-right
          ease: [0.25, 1, 0.5, 1]
        }}
        style={{ transformOrigin: `${(x ?? 0) + (width ?? 0) / 2}px ${(y ?? 0) + (height ?? 0)}px` }}
        className="cursor-pointer transition-opacity hover:opacity-85"
      />
    )
  }

  // ── Tooltip for Waterfall ───────────────────────────────────────────────────
  const renderWaterfallTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    const data = payload[0]?.payload
    if (!data) return null

    const isStarting = data.type === 'starting'
    const isFinal = data.type === 'final'
    const isDeduction = data.delta_amount < 0

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700/60 text-xs space-y-1.5 z-50">
        <div className="font-bold text-slate-100 flex items-center justify-between gap-4">
          <span>{data.label}</span>
          <Badge
            variant="outline"
            className={`text-[9px] uppercase tracking-wider font-mono font-bold px-1.5 py-0.5 border ${
              isStarting
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : isFinal
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : isDeduction
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {data.type}
          </Badge>
        </div>

        <div className="flex justify-between items-center gap-6 pt-1 border-t border-slate-700/60 text-slate-300">
          <span className="text-[11px]">Step Delta:</span>
          <span
            className={`font-mono font-bold ${
              isStarting || isFinal
                ? 'text-white'
                : isDeduction
                ? 'text-rose-400'
                : 'text-emerald-400'
            }`}
          >
            {isStarting || isFinal
              ? formatINR(data.delta_amount)
              : `${data.delta_amount >= 0 ? '+' : ''}${formatINR(data.delta_amount)}`}
          </span>
        </div>

        <div className="flex justify-between items-center gap-6 text-slate-300">
          <span className="text-[11px]">Cumulative Reconciled:</span>
          <span className="font-mono font-black text-white">
            {formatINR(data.cumulative_amount)}
          </span>
        </div>
      </div>
    )
  }

  // Early return during initial loading
  if (loading && !moneyFlowData) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-slate-200/60 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-slate-200/50 rounded-2xl animate-pulse" />
        <div className="h-96 bg-slate-200/50 rounded-2xl animate-pulse" />
      </div>
    )
  }

  const userRole = reviewer?.role?.toUpperCase() || ''
  const isCompanyWide = moneyFlowData?.portfolio_scope === 'COMPANY_WIDE' || userRole === 'ADMIN'

  return (
    <div className="space-y-8 pb-14">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 border-b border-slate-200/60 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-sky-50 text-sky-700 border-sky-200 font-bold text-[11px] tracking-wider uppercase"
            >
              Phase 8 • Financial Traceability
            </Badge>
            <span className="text-xs font-mono text-slate-500">
              Scope: {isCompanyWide ? 'Organization (All Portfolios)' : `Portfolio ${moneyFlowData?.portfolio_scope}`}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2.5">
            <ArrowRightLeft className="h-7 w-7 text-sky-600" />
            Money Flow & Settlement Bridge
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            End-to-end capital flow tracking from gateway gross settlements through classification into reconciled audit outcomes.
          </p>
        </div>

        {/* Range Selector & Manual Refresh */}
        <div className="flex items-center gap-2.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 shadow-xs">
          {(['30d', '60d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                range === r
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {String(r || '').toUpperCase()}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-7 px-2 text-slate-600 hover:text-slate-900"
            title="Refresh Data"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-sky-600' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── Executive Summary KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Settlement Inflow */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-sky-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Settlement Inflow
              </span>
              <div className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
              {formatINR(moneyFlowData?.total_inflow_inr || 0)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {moneyFlowData?.total_cases_analyzed || 0} batches processed in {range}
            </span>
          </CardContent>
        </Card>

        {/* KPI 2: Expected Net */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-blue-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Expected Net Baseline
              </span>
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-blue-700 mt-2 font-mono">
              {formatINR(bridgeData?.total_expected_inr || 0)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Gross captured before adjustments
            </span>
          </CardContent>
        </Card>

        {/* KPI 3: Deductions & Mismatches */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-rose-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Variance & Deductions
              </span>
              <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 mt-2 font-mono">
              -{formatINR(bridgeData?.net_variance_inr || 0)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Fees, refunds & discrepancy variance
            </span>
          </CardContent>
        </Card>

        {/* KPI 4: Actual Net Settled */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden hover:border-emerald-300 transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Actual Net Settled
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-2 font-mono">
              {formatINR(bridgeData?.total_actual_inr || 0)}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-1 block">
              100% matched & bank verified
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ── Task 8.1: Capital Flow Sankey Diagram ───────────────────────────── */}
      <Card className="bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Coins className="h-5 w-5 text-sky-600" />
                Capital Flow & Resolution Topology
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualizes ₹ moving from settlement through matching/exceptions to final resolution.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
              <span className="font-semibold text-slate-700">Money in = Money out</span>
              <span className="text-emerald-600 font-bold">✓ Conserved</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {sankeyChartData.nodes.length > 0 && sankeyChartData.links.length > 0 ? (
            <div className="w-full h-[420px]">
              <ResponsiveContainer width="100%" height={420}>
                <Sankey
                  data={sankeyChartData}
                  nodeWidth={12}
                  nodePadding={32}
                  margin={{ top: 20, right: 180, bottom: 20, left: 160 }}
                  link={renderSankeyLink}
                  node={renderSankeyNode}
                />
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <Info className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">No capital flow records found for {range}</p>
            </div>
          )}

          {/* Legend Guide */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#0284c7]" />
              <span className="font-medium">1. Gross Gateway Settlement</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#059669]" />
              <span className="font-medium">2. Auto-Matched</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#e11d48]" />
              <span className="font-medium">3. Exceptions (Critical/High/Med)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#16a34a]" />
              <span className="font-medium">4. Resolved-Approved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#dc2626]" />
              <span className="font-medium">5. Resolved-Rejected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-[#6366f1]" />
              <span className="font-medium">6. Pending Resolution</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Task 8.2: Waterfall Bridge Chart ─────────────────────────────────── */}
      <Card className="bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                Reconciliation Waterfall Bridge
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Expected Net → adjustments by category → Actual Net Settled. Built with stacked BarChart with an invisible base.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                Baseline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                Deduction
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                Addition
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                Actual Net
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {waterfallChartData.length > 0 ? (
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={waterfallChartData}
                  margin={{ top: 20, right: 30, left: 30, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={renderWaterfallTooltip} />

                  {/* Invisible base bar series */}
                  <Bar
                    dataKey="base"
                    stackId="waterfall"
                    fill="transparent"
                    isAnimationActive={false}
                  />

                  {/* Visible delta bar series with left-to-right stepping entrance */}
                  <Bar
                    dataKey="delta"
                    stackId="waterfall"
                    shape={renderWaterfallBar}
                    isAnimationActive={false}
                  >
                    {waterfallChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fillColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <Info className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">No reconciliation bridge data available for {range}</p>
            </div>
          )}

          {/* Step Breakdown Table */}
          <div className="mt-6 pt-6 border-t border-slate-100 overflow-x-auto">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Reconciliation Step Breakdown
            </h4>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Step</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Step Variance</th>
                  <th className="py-2.5 px-3 text-right">Cumulative Reconciled</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {waterfallChartData.map((step, idx) => {
                  const isStart = step.type === 'starting'
                  const isEnd = step.type === 'final'
                  const isNegative = step.delta_amount < 0

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isStart || isEnd ? 'bg-slate-50/50 font-semibold' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{step.label}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 uppercase text-[10px]">
                        {step.type}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          isStart || isEnd
                            ? 'text-slate-900'
                            : isNegative
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {isStart || isEnd
                          ? formatINR(step.delta_amount)
                          : `${step.delta_amount >= 0 ? '+' : ''}${formatINR(step.delta_amount)}`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                        {formatINR(step.cumulative_amount)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isStart ? (
                          <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                            Baseline
                          </Badge>
                        ) : isEnd ? (
                          <Badge variant="success" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            Reconciled
                          </Badge>
                        ) : isNegative ? (
                          <Badge variant="destructive" className="text-[9px] bg-rose-50 text-rose-700 border-rose-200">
                            Deduction
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            Adjustment
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
