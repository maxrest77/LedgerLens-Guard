import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import api from '../lib/api'
import { toast } from 'sonner'
import { useAuthStore } from '../store/auth'
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  CheckCircle2,
  RotateCw,
  Search,
  ExternalLink,
  FileCheck2,
  FileText,
  Lock,
  Copy,
  Check,
  Globe,
  Terminal
} from 'lucide-react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts'

// ── Types ───────────────────────────────────────────────────────────────────

interface VerificationHistoryItem {
  date: string
  success_rate_pct: number
  status: string
  blocks_checked: number
  tampered_at_index?: number | null
}

interface DPDPErasureItem {
  erasure_id: string
  subject_id: string
  request_date: string
  completed_date: string
  blocks_pseudonym_verified_count: number
  dpdp_section_reference: string
  verification_status: string
}

interface AdminOverrideItem {
  override_id: string
  timestamp: string
  admin_user: string
  exception_id: string
  original_status: string
  overridden_status: string
  justification: string
  audit_block_ref: string
  block_hash: string
  portfolio_id: string
}

interface TimelinePoint {
  date: string
  count: number
  cumulative_count: number
}

interface ComplianceSummaryResponse {
  current_status: {
    is_valid: boolean
    uptime_pct: number
    total_blocks: number
    latest_block_hash: string
    latest_block_index: number
    total_dpdp_erasures: number
    total_admin_overrides: number
    data_localization: string
    regulatory_status: string
  }
  verification_history: VerificationHistoryItem[]
  dpdp_erasures_timeline: TimelinePoint[]
  admin_overrides_timeline: TimelinePoint[]
}

interface RegulatorPackageManifest {
  package_id: string
  generated_at: string
  generated_by: string
  portfolio_scope: string
  date_range: { start_date: string; end_date: string }
  payload_sha256: string
  cases_count: number
  case_ids: string[]
  audit_blocks_covered: number
  latest_audit_block_hash_at_generation: string
  production_block_index: number
  production_block_hash: string
  opentimestamps_proof_reference: string
  compliance_standards: string[]
  chain_verification_status: string
}

interface RegulatorPackageResponse {
  status: string
  message: string
  package_id: string
  manifest: RegulatorPackageManifest
  certificate: string
  csv_data: string
  audit_block_index: number
  audit_block_hash: string
  latest_block_hash: string
  payload_sha256: string
  chain_verified: boolean
  download_links: {
    manifest_json: string
    cases_csv: string
    certificate_txt: string
  }
}

export default function ComplianceCenter() {
  const { reviewer } = useAuthStore()

  // State
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | '90d'>('30d')
  const [summary, setSummary] = useState<ComplianceSummaryResponse | null>(null)
  const [erasures, setErasures] = useState<DPDPErasureItem[]>([])
  const [erasureTrend, setErasureTrend] = useState<TimelinePoint[]>([])
  const [overrides, setOverrides] = useState<AdminOverrideItem[]>([])
  const [overrideTrend, setOverrideTrend] = useState<TimelinePoint[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [erasureSearch, setErasureSearch] = useState<string>('')
  const [overrideSearch, setOverrideSearch] = useState<string>('')

  // Generator Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [genStartDate, setGenStartDate] = useState<string>('')
  const [genEndDate, setGenEndDate] = useState<string>('')
  const [genScope, setGenScope] = useState<string>('GLOBAL')
  const [genNotes, setGenNotes] = useState<string>('Statutory RBI Cyber Security Framework & DPDP Act 2023 Inspection')
  const [packageResult, setPackageResult] = useState<RegulatorPackageResponse | null>(null)
  const [copiedCert, setCopiedCert] = useState<boolean>(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sumRes, eraRes, ovrRes] = await Promise.all([
        api.get(`/api/compliance/summary?range=${timeRange}`),
        api.get('/api/compliance/erasure-log'),
        api.get('/api/compliance/admin-overrides')
      ])
      setSummary(sumRes.data)
      setErasures(eraRes.data.records || [])
      setErasureTrend(eraRes.data.trend || [])
      setOverrides(ovrRes.data.records || [])
      setOverrideTrend(ovrRes.data.trend || [])
    } catch (err: any) {
      console.error('Failed to load compliance center telemetry:', err)
      setError(err?.response?.data?.detail || 'Failed to load compliance telemetry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [timeRange])

  // Filtered lists
  const filteredErasures = useMemo(() => {
    if (!erasureSearch.trim()) return erasures
    const q = erasureSearch.toLowerCase()
    return erasures.filter(
      e =>
        e.erasure_id.toLowerCase().includes(q) ||
        e.subject_id.toLowerCase().includes(q) ||
        e.dpdp_section_reference.toLowerCase().includes(q)
    )
  }, [erasures, erasureSearch])

  const filteredOverrides = useMemo(() => {
    if (!overrideSearch.trim()) return overrides
    const q = overrideSearch.toLowerCase()
    return overrides.filter(
      o =>
        o.override_id.toLowerCase().includes(q) ||
        o.exception_id.toLowerCase().includes(q) ||
        o.admin_user.toLowerCase().includes(q) ||
        o.justification.toLowerCase().includes(q)
    )
  }, [overrides, overrideSearch])

  // Quick date presets
  const applyPreset = (preset: 'all' | '30d' | '90d' | 'today') => {
    const today = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    if (preset === 'all') {
      setGenStartDate('')
      setGenEndDate('')
    } else if (preset === '30d') {
      const past = new Date()
      past.setDate(past.getDate() - 30)
      setGenStartDate(fmt(past))
      setGenEndDate(fmt(today))
    } else if (preset === '90d') {
      const past = new Date()
      past.setDate(past.getDate() - 90)
      setGenStartDate(fmt(past))
      setGenEndDate(fmt(today))
    } else if (preset === 'today') {
      setGenStartDate(fmt(today))
      setGenEndDate(fmt(today))
    }
  }

  // Handle Package Generation
  const handleGeneratePackage = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await api.post('/api/compliance/regulatory-package', {
        start_date: genStartDate.trim() || null,
        end_date: genEndDate.trim() || null,
        portfolio_scope: genScope,
        notes: genNotes
      })
      setPackageResult(res.data)
      // Refresh summary to reflect newly appended block
      fetchData()
      toast.success(`Sealed regulatory package with ${res.data.manifest.cases_count} cases`)
    } catch (err: any) {
      console.error('Failed to generate regulator package:', err)
      const errMsg = err?.response?.data?.detail || 'Failed to generate regulator production package.'
      setError(errMsg)
      toast.error(errMsg)
      alert(errMsg)
    } finally {
      setIsGenerating(false)
    }
  }

  // File Download Helpers
  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    try {
      const isCsv = mimeType.includes('csv') || filename.endsWith('.csv')
      const finalContent = isCsv ? (content.startsWith('\uFEFF') ? content : '\uFEFF' + content) : content
      const blob = new Blob([finalContent], { type: `${mimeType};charset=utf-8;` })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.setAttribute('download', filename)
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a)
        }
        window.URL.revokeObjectURL(url)
      }, 2000)
      toast.success(`Downloaded ${filename}`)
    } catch (err) {
      console.error('Download error:', err)
      toast.error(`Failed to download ${filename}`)
    }
  }

  const handleDownloadAsset = async (
    fileType: 'manifest.json' | 'cases.csv' | 'certificate.txt',
    mimeType: string,
    fallbackContent: string
  ) => {
    if (!packageResult) return
    const filename = `${packageResult.package_id}_${fileType}`
    try {
      const res = await api.get(`/api/compliance/download-package/${packageResult.package_id}/${fileType}`, {
        responseType: 'blob'
      })
      const blob = new Blob([res.data], { type: `${mimeType};charset=utf-8;` })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.setAttribute('download', filename)
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 2000)
      toast.success(`Downloaded ${filename}`)
    } catch {
      downloadTextFile(filename, fallbackContent, mimeType)
    }
  }

  const handleCopyCertificate = () => {
    if (!packageResult?.certificate) return
    navigator.clipboard.writeText(packageResult.certificate)
    setCopiedCert(true)
    setTimeout(() => setCopiedCert(false), 2000)
  }

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-500">
      {/* ── Top Header & Statutory Seals ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
              Compliance Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Statutory RBI & DPDP Active
            </span>
            {reviewer?.role && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                Auditor Role: {reviewer.role}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Tamper-evident audit chain telemetry, DPDP Section 12 right-to-erasure logs, and regulatory package generation.
          </p>
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl mt-3 font-mono">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-9 gap-2 text-xs font-mono border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            Sync Ledger
          </Button>

          {/* Prominent Action Button: Task 10.4 */}
          <Button
            onClick={() => {
              setPackageResult(null)
              setIsModalOpen(true)
            }}
            className="h-9 gap-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-all"
          >
            <FileCheck2 className="h-4 w-4 text-white" />
            Generate Regulator Package
          </Button>
        </div>
      </div>

      {/* ── Statutory Guardrail KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Chain Integrity */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
              Audit Chain Integrity
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <Lock className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">
            {summary?.current_status.is_valid ? '100.0% VALID' : 'DEGRADED'}
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">
            {summary?.current_status.total_blocks || 0} Cryptographic Blocks Verified
          </p>
        </Card>

        {/* Card 2: RBI Data Localization */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl p-5 border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
              RBI Data Localization
            </span>
            <div className="h-8 w-8 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center">
              <Globe className="h-4 w-4 text-sky-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">ap-south-1</div>
          <p className="text-xs text-slate-500 font-mono mt-1">Mumbai/Hyd DC Strict Residency</p>
        </Card>

        {/* Card 3: DPDP Erasures */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
              DPDP Section 12 Erasures
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
              <FileText className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">
            {summary?.current_status.total_dpdp_erasures || 0} Processed
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">SHA-256 Pseudonymized in Chain</p>
        </Card>

        {/* Card 4: Cross-Portfolio Overrides */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl p-5 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
              Admin Overrides Logged
            </span>
            <div className="h-8 w-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">
            {summary?.current_status.total_admin_overrides || 0} Recorded
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">100% Dual Maker-Checker Trail</p>
        </Card>
      </div>

      {/* ── Task 10.1: Chain Uptime History Chart ─────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 gap-2 border-b border-slate-100">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Cryptographic Audit Chain Uptime & Daily Verification Rate
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Daily verification success rate over time from Task 6.6. Green line at 100%, drops if any block is tampered.
            </CardDescription>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            {(['7d', '14d', '30d', '90d'] as const).map(rng => (
              <button
                key={rng}
                onClick={() => setTimeRange(rng)}
                className={`px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                  timeRange === rng
                    ? 'bg-white text-emerald-700 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {rng.toUpperCase()}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary?.verification_history || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="uptimeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => d.slice(5)}
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  domain={[80, 105]}
                  ticks={[80, 90, 100]}
                  tickFormatter={v => `${v}%`}
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as VerificationHistoryItem
                      return (
                        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-xs">
                          <div className="font-semibold text-emerald-700 flex items-center gap-1.5 mb-1 font-mono">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Date: {data.date}
                          </div>
                          <div className="text-slate-700">
                            Success Rate: <span className="font-mono font-bold text-emerald-600">{data.success_rate_pct.toFixed(2)}%</span>
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            Status: <span className="font-mono text-slate-800 font-semibold">{data.status}</span>
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            Blocks Checked: <span className="font-mono text-slate-800 font-semibold">{data.blocks_checked}</span>
                          </div>
                          {data.tampered_at_index && (
                            <div className="text-rose-600 font-mono font-semibold mt-1">
                              Tampered At Index: #{data.tampered_at_index}
                            </div>
                          )}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="success_rate_pct"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#uptimeGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── Two-Column Section: Tasks 10.2 & 10.3 ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Task 10.2: DPDP Erasure Log ──────────────────────────────────── */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                DPDP Erasure Log
              </CardTitle>
              <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 font-mono text-xs font-semibold">
                {erasures.length} Processed
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Processed erasure requests under Section 12 of the Digital Personal Data Protection Act 2023.
            </CardDescription>

            {/* Mini Trend Chart */}
            <div className="h-24 w-full mt-3 pt-2 border-t border-slate-100">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={erasureTrend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={d => d.slice(5)} stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload as TimelinePoint
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2 text-[11px] shadow-lg">
                            <span className="text-amber-600 font-mono font-semibold">{pt.date}</span>: {pt.count} requests (Cum: {pt.cumulative_count})
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Search Input */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search by Erasure ID, Subject Hash, or Section..."
                value={erasureSearch}
                onChange={e => setErasureSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-amber-500 shadow-xs"
              />
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto max-h-80 p-0">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold uppercase text-[10px] sticky top-0 backdrop-blur-md border-b border-slate-200/80">
                <tr>
                  <th className="p-3">Erasure ID</th>
                  <th className="p-3">Subject ID</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3" title="Audit blocks cryptographically verified with pre-block SHA-256 pseudonymization">Verified Blocks</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredErasures.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No DPDP erasure requests found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredErasures.map(e => (
                    <tr key={e.erasure_id} className="hover:bg-slate-50/80 transition-colors font-mono">
                      <td className="p-3 font-semibold text-amber-600">{e.erasure_id}</td>
                      <td className="p-3 text-slate-600 truncate max-w-[120px]" title={e.subject_id}>
                        {e.subject_id.length > 14 ? `${e.subject_id.slice(0, 6)}...${e.subject_id.slice(-4)}` : e.subject_id}
                      </td>
                      <td className="p-3 text-slate-500">
                        {e.completed_date ? e.completed_date.slice(0, 10) : '—'}
                      </td>
                      <td className="p-3 text-slate-800 font-semibold">{e.blocks_pseudonym_verified_count ?? 0}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {e.verification_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── Task 10.3: Admin Override History ────────────────────────────── */}
        <Card className="bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-xs rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-purple-500" />
                Admin Override History
              </CardTitle>
              <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50 font-mono text-xs font-semibold">
                {overrides.length} Overrides
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Cross-portfolio administrative override events permanently recorded in the tamper-evident chain.
            </CardDescription>

            {/* Mini Trend Chart */}
            <div className="h-24 w-full mt-3 pt-2 border-t border-slate-100">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overrideTrend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={d => d.slice(5)} stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload as TimelinePoint
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2 text-[11px] shadow-lg">
                            <span className="text-purple-600 font-mono font-semibold">{pt.date}</span>: {pt.count} overrides (Cum: {pt.cumulative_count})
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Search Input */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search by Override ID, Exception ID, Admin..."
                value={overrideSearch}
                onChange={e => setOverrideSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-purple-500 shadow-xs"
              />
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto max-h-80 p-0">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold uppercase text-[10px] sticky top-0 backdrop-blur-md border-b border-slate-200/80">
                <tr>
                  <th className="p-3">Override ID</th>
                  <th className="p-3">Exception ID</th>
                  <th className="p-3">Admin</th>
                  <th className="p-3">Justification</th>
                  <th className="p-3">Block Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOverrides.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No admin override events found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredOverrides.map(o => (
                    <tr key={o.override_id} className="hover:bg-slate-50/80 transition-colors font-mono">
                      <td className="p-3 font-semibold text-purple-600">{o.override_id}</td>
                      <td className="p-3">
                        <Link
                          to={`/exceptions/${o.exception_id}`}
                          className="text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                        >
                          {o.exception_id}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                      <td className="p-3 text-slate-600 truncate max-w-[100px]" title={o.admin_user}>
                        {o.admin_user}
                      </td>
                      <td className="p-3 text-slate-500 truncate max-w-[140px]" title={o.justification}>
                        {o.justification}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                          {o.audit_block_ref}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── Task 10.4: Regulator Production Package Modal ──────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-6 w-6 text-emerald-600" />
                <h3 className="text-xl font-bold text-slate-900">Generate Regulator Production Package</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 rounded-lg"
              >
                ✕
              </Button>
            </div>

            {!packageResult ? (
              <div className="space-y-4 pt-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Bundles all reconciliation cases, evidence artifacts, and tamper-evident audit chain blocks
                  within the selected scope into a sealed regulatory manifest. Immutably logs a{' '}
                  <span className="font-mono text-emerald-600 font-semibold">REGULATORY_PRODUCTION_GENERATED</span> event into the
                  hash chain with an OpenTimestamps proof reference.
                </p>

                {/* Quick Date Presets */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                    Date Range Preset
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <button
                      type="button"
                      onClick={() => applyPreset('all')}
                      className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-all ${
                        !genStartDate && !genEndDate
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      All Time (Recommended)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('30d')}
                      className="px-2.5 py-1 text-xs font-mono rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Last 30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('90d')}
                      className="px-2.5 py-1 text-xs font-mono rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Last 90 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('today')}
                      className="px-2.5 py-1 text-xs font-mono rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Today
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Start Date (Optional)</label>
                    <Input
                      type="date"
                      value={genStartDate}
                      onChange={e => setGenStartDate(e.target.value)}
                      className="bg-white border-slate-200 text-xs shadow-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">End Date (Optional)</label>
                    <Input
                      type="date"
                      value={genEndDate}
                      onChange={e => setGenEndDate(e.target.value)}
                      className="bg-white border-slate-200 text-xs shadow-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-mono -mt-2">
                  * Leaving dates blank includes all 115 historical cases across the entire audit chain.
                </p>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Portfolio Scope</label>
                  <select
                    value={genScope}
                    onChange={e => setGenScope(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono shadow-xs"
                  >
                    <option value="GLOBAL">GLOBAL (All Portfolios & Gateways — 115 cases)</option>
                    <option value="ENTERPRISE_CORE">ENTERPRISE_CORE (Tier-1 Core Banking)</option>
                    <option value="ECOMMERCE_RETAIL">ECOMMERCE_RETAIL (Retail & Merchant Gateways)</option>
                    <option value="FINTECH_WALLETS">FINTECH_WALLETS (High-Velocity Wallets)</option>
                    <option value="GLOBAL_CARDS">GLOBAL_CARDS (Cards & International)</option>
                    <option value="CROSS_BORDER">CROSS_BORDER (FX & Multi-Currency)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Audit Purpose / Regulatory Notes</label>
                  <Input
                    value={genNotes}
                    onChange={e => setGenNotes(e.target.value)}
                    placeholder="E.g., Statutory RBI Comprehensive Audit 2026"
                    className="bg-white border-slate-200 text-xs shadow-xs"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsModalOpen(false)}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGeneratePackage}
                    disabled={isGenerating}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 shadow-sm"
                  >
                    {isGenerating ? (
                      <>
                        <RotateCw className="h-4 w-4 animate-spin" />
                        Sealing Cryptographic Chain...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Seal & Generate Package
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* Package Result View with Certificate & Downloads */
              <div className="space-y-4 pt-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-900 font-mono">
                        CRYPTOGRAPHICALLY SEALED & VERIFIED
                      </h4>
                      <p className="text-xs text-emerald-700 font-mono">
                        Package ID: {packageResult.package_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-100 font-mono font-bold">
                      Block #{packageResult.audit_block_index}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-100 font-mono font-bold">
                      {packageResult.manifest.cases_count} Cases
                    </Badge>
                  </div>
                </div>

                {/* Technical Hash Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Payload SHA-256:</span>
                    <span className="text-emerald-700 font-semibold break-all">{packageResult.payload_sha256}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Audit Block Hash:</span>
                    <span className="text-sky-700 font-semibold break-all">{packageResult.audit_block_hash}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Cases Covered:</span>
                    <span className={`font-bold ${packageResult.manifest.cases_count > 0 ? 'text-emerald-700 text-sm' : 'text-rose-600'}`}>
                      {packageResult.manifest.cases_count} cases
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">OpenTimestamps Reference:</span>
                    <span className="text-amber-700 truncate block font-semibold">{packageResult.manifest.opentimestamps_proof_reference}</span>
                  </div>
                </div>

                {/* Certificate Monospace Display */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold text-slate-600 flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-slate-500" />
                      Verification Certificate (.txt)
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyCertificate}
                      className="h-6 text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1"
                    >
                      {copiedCert ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      {copiedCert ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed select-all shadow-inner">
                    {packageResult.certificate}
                  </pre>
                </div>

                {/* Download Action Buttons */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleDownloadAsset(
                          'manifest.json',
                          'application/json',
                          JSON.stringify(packageResult.manifest, null, 2)
                        )
                      }
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs flex items-center gap-1.5 shadow-xs"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-600" />
                      Manifest (JSON)
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleDownloadAsset(
                          'cases.csv',
                          'text/csv',
                          packageResult.csv_data
                        )
                      }
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs flex items-center gap-1.5 shadow-xs font-medium"
                    >
                      <Download className="h-3.5 w-3.5 text-sky-600" />
                      Cases (CSV) • {packageResult.manifest.cases_count} cases
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleDownloadAsset(
                          'certificate.txt',
                          'text/plain',
                          packageResult.certificate
                        )
                      }
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs flex items-center gap-1.5 shadow-xs"
                    >
                      <Download className="h-3.5 w-3.5 text-purple-600" />
                      Certificate (.txt)
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => setIsModalOpen(false)}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs px-4"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
