import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table'
import api from '../lib/api'
import { formatDateTime } from '../lib/formatters'
import { 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  FileCheck2, 
  ArrowRight, 
  Search
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useSearchParams, useNavigate } from 'react-router-dom'

interface VerificationResult {
  valid: boolean
  block_count: number
  tampered_at_index?: number | null
  time_taken_ms: number
}

interface AuditBlockData {
  index: number
  timestamp: string
  case_id: string
  reviewer: string
  action: string
  reason: string
  payload_snapshot: string
  previous_hash: string
  block_hash: string
}

interface AdminOverrideItem {
  block_index: number
  case_id: string
  admin_identity: string
  portfolio: string
  timestamp: string
  reason: string
  block_hash: string
}

interface EvidenceRetrievalItem {
  block_index: number
  case_id: string
  reviewer: string
  files_accessed: string[]
  resource_type: string
  timestamp: string
  reason: string
  block_hash: string
}

export default function AuditLog() {
  const { reviewer } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentTab = searchParams.get('tab') || 'chain'

  const [blocks, setBlocks] = useState<AuditBlockData[]>([])
  const [overrides, setOverrides] = useState<AdminOverrideItem[]>([])
  const [evidenceRetrievals, setEvidenceRetrievals] = useState<EvidenceRetrievalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const userRole = reviewer?.role?.toUpperCase() || ''
  const canSeeOverrides = userRole === 'ADMIN'
  const canSeeEvidence = userRole === 'ADMIN'

  useEffect(() => {
    fetchData()
  }, [userRole])

  const fetchData = async () => {
    setLoading(true)
    try {
      const promises: Promise<any>[] = [api.get('/api/audit')]
      if (canSeeOverrides) {
        promises.push(api.get('/api/analytics/admin-overrides'))
      }
      if (canSeeEvidence) {
        promises.push(api.get('/api/analytics/evidence-retrievals'))
      }

      const results = await Promise.allSettled(promises)
      if (results[0].status === 'fulfilled') {
        setBlocks(results[0].value?.data?.blocks || [])
      }
      
      let nextIdx = 1
      if (canSeeOverrides && results[nextIdx]) {
        if (results[nextIdx].status === 'fulfilled') {
          const val: any = (results[nextIdx] as PromiseFulfilledResult<any>).value
          setOverrides(val?.data?.overrides || [])
        }
        nextIdx++
      }
      if (canSeeEvidence && results[nextIdx]) {
        if (results[nextIdx].status === 'fulfilled') {
          const val: any = (results[nextIdx] as PromiseFulfilledResult<any>).value
          setEvidenceRetrievals(val?.data?.retrievals || [])
        }
      }
    } catch (err) {
      console.error('Failed to load audit data', err)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    setVerificationResult(null)
    try {
      const res = await api.get('/api/audit/verify')
      setVerificationResult(res.data)
    } catch (err) {
      // handled
    } finally {
      setVerifying(false)
    }
  }

  const setTab = (tab: string) => {
    setSearchParams({ tab })
  }

  // Filtered overrides
  const filteredOverrides = overrides.filter(o => 
    o.case_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.admin_identity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.portfolio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.reason?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Filtered evidence retrievals
  const filteredEvidence = evidenceRetrievals.filter(e => 
    e.case_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.reviewer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.resource_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.files_accessed?.some(f => String(f || '').toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[11px] tracking-wider uppercase">
              Phase 4 • Governance & Trust
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Cryptographic Audit Ledger</h2>
          <p className="text-sm text-slate-500 mt-0.5 font-medium">
            Tamper-evident chain of reviewer decisions, cross-portfolio administrative overrides, and evidence access telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={handleVerify} 
            disabled={verifying || loading}
            className={`shadow-sm font-semibold px-4 text-xs h-9 ${verificationResult?.valid ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            {verifying ? 'Verifying Hashes...' : 'Verify Full Chain'}
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2 overflow-x-auto">
        <button
          onClick={() => setTab('chain')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            currentTab === 'chain'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Full Audit Chain ({blocks.length})</span>
        </button>

        {canSeeOverrides && (
          <button
            onClick={() => setTab('overrides')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              currentTab === 'overrides'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Admin Overrides ({overrides.length})</span>
          </button>
        )}

        {canSeeEvidence && (
          <button
            onClick={() => setTab('evidence')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              currentTab === 'evidence'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            <span>Evidence Access Feed ({evidenceRetrievals.length})</span>
          </button>
        )}
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <Card className={`border shadow-sm rounded-2xl overflow-hidden relative ${verificationResult.valid ? 'border-emerald-200/60 bg-emerald-50/50' : 'border-red-200/60 bg-red-50/50'}`}>
          <div className="absolute inset-0 bg-white/20 backdrop-blur-xl pointer-events-none" />
          <CardContent className="relative z-10 p-5 flex items-center gap-4">
            {verificationResult.valid ? (
              <>
                <ShieldCheck className="h-8 w-8 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-emerald-800">Chain Intact & Verified</h4>
                  <p className="text-xs text-emerald-700 font-medium mt-0.5">
                    All SHA-256 block hashes and back-pointers matched. Cryptographic integrity confirmed across {blocks.length} blocks in {verificationResult.time_taken_ms}ms.
                  </p>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert className="h-8 w-8 text-red-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-red-800">Tampering Detected</h4>
                  <p className="text-xs text-red-700 font-medium mt-0.5">
                    Hash mismatch detected at Block Index #{verificationResult.tampered_at_index}. Chain has been compromised.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 1: FULL AUDIT CHAIN */}
      {currentTab === 'chain' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {blocks.map((block) => (
              <Card key={block.index} className="bg-white/50 backdrop-blur-xl shadow-xs border border-slate-200/60 rounded-2xl overflow-hidden hover:border-slate-300 transition-all">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <Badge variant="outline" className="font-mono text-xs font-bold bg-slate-100 text-slate-700 border-slate-200">
                        #{block.index}
                      </Badge>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        block.action === 'ADMIN_CROSS_PORTFOLIO_OVERRIDE'
                          ? 'bg-amber-100 text-amber-800 font-mono'
                          : block.action === 'EVIDENCE_RETRIEVED'
                          ? 'bg-blue-100 text-blue-800 font-mono'
                          : block.action === 'APPROVE'
                          ? 'bg-emerald-100 text-emerald-800 font-mono'
                          : 'bg-slate-100 text-slate-800 font-mono'
                      }`}>
                        {block.action}
                      </span>
                      {block.case_id && (
                        <button
                          onClick={() => navigate(`/exceptions/${block.case_id}`)}
                          className="font-mono text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                        >
                          Case: {block.case_id}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <span className="text-xs font-mono text-slate-400">{formatDateTime(block.timestamp)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-slate-500 block">Reviewer / Actor</span>
                      <span className="font-mono font-medium text-slate-800">{block.reviewer}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">Reason / Snapshot</span>
                      <span className="text-slate-700 font-medium">{block.reason || 'None provided'}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2 font-mono text-[11px] text-slate-400 truncate">
                    <div className="truncate">
                      <span className="font-semibold text-slate-500">Hash: </span>
                      <span className="text-slate-600">{block.block_hash}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Task 4.2 — Admin Override Transparency Panel */}
      {currentTab === 'overrides' && canSeeOverrides && (
        <Card className="bg-white/50 backdrop-blur-xl shadow-sm border border-amber-200/80 rounded-2xl overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-amber-200/40 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="bg-amber-100 text-amber-800 border-amber-300 font-bold text-[10px] uppercase">
                    Task 4.2 • Transparency & Oversight
                  </Badge>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  Admin Cross-Portfolio Override Ledger
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every <span className="font-mono font-semibold text-amber-800">ADMIN_CROSS_PORTFOLIO_OVERRIDE</span> event ever executed, preventing hidden unilateral admin bypasses.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter overrides..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 pr-3 w-full rounded-lg border border-slate-200 bg-white/90 text-xs text-slate-700"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 overflow-hidden bg-white/80 shadow-xs">
              <Table>
                <TableHeader className="bg-slate-50/60">
                  <TableRow className="border-slate-200/70">
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Block #</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Case ID</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Admin Identity</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Portfolio</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Timestamp</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Override Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOverrides.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-slate-400 text-xs">
                        No cross-portfolio admin override events found in this scope.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOverrides.map((ovr) => (
                      <TableRow key={ovr.block_index} className="border-slate-200/60 hover:bg-amber-50/30 transition-colors">
                        <TableCell className="font-mono text-xs font-bold text-slate-700">#{ovr.block_index}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/exceptions/${ovr.case_id}`)}
                            className="font-mono text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {ovr.case_id}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-slate-900">{ovr.admin_identity}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px] font-bold bg-amber-50 text-amber-800 border-amber-200">
                            {ovr.portfolio}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{formatDateTime(ovr.timestamp)}</TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium max-w-xs">{ovr.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: Task 4.3 — Evidence Retrieval Activity Feed */}
      {currentTab === 'evidence' && canSeeEvidence && (
        <Card className="bg-white/50 backdrop-blur-xl shadow-sm border border-blue-200/80 rounded-2xl overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-blue-200/40 pb-4">
              <div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                  Task 4.3 • Evidence Access Audit
                </Badge>
                <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-blue-600" />
                  Evidence Retrieval Activity Feed
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live, immutable audit feed tracking every <span className="font-mono font-semibold text-blue-800">EVIDENCE_RETRIEVED</span> access event logged across the company.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter access events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 pr-3 w-full rounded-lg border border-slate-200 bg-white/90 text-xs text-slate-700"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 overflow-hidden bg-white/80 shadow-xs">
              <Table>
                <TableHeader className="bg-slate-50/60">
                  <TableRow className="border-slate-200/70">
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Block #</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Case ID</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Retrieved By</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Resource Type</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Files Accessed</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvidence.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-slate-400 text-xs">
                        No evidence retrieval events logged yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEvidence.map((evt) => (
                      <TableRow key={evt.block_index} className="border-slate-200/60 hover:bg-blue-50/30 transition-colors">
                        <TableCell className="font-mono text-xs font-bold text-slate-700">#{evt.block_index}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/exceptions/${evt.case_id}`)}
                            className="font-mono text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {evt.case_id}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-slate-900">{evt.reviewer}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px] font-bold bg-blue-50 text-blue-800 border-blue-200">
                            {evt.resource_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {evt.files_accessed.join(', ') || 'Evidence Pack PDF'}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{formatDateTime(evt.timestamp)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
