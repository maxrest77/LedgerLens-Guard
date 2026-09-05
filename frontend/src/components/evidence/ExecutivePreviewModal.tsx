import { useEffect, useState } from 'react'
import { Printer, Download, X, ShieldCheck, FileText, CheckCircle2, Lock, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatPaisa, formatDateTime } from '../../lib/formatters'
import api from '../../lib/api'
import { toast } from 'sonner'

interface MakerCheckerInfo {
  email: string
  proposed_action?: string
  action?: string
  reason?: string
  timestamp: string | null
}

interface EvidenceFile {
  filename: string
  file_type: string
  file_sha256: string
  uploaded_by: string
  submitter_role?: string
  uploaded_at: string
  audit_block_id: number | null
}

interface ExtractedTransaction {
  record_index: number
  utr: string
  amount_paisa: number
  fee_paisa: number
  tax_paisa: number
  net_paisa: number
  timestamp?: string
  masked_account_or_pan?: string
  narrative?: string
  source_file?: string
  submitted_by?: string
  submitter_role?: string
}

export interface ExecutivePackData {
  case: {
    case_id: string
    portfolio_id: string
    exception_code: string
    severity: string
    status: string
    opened_at: string
    resolved_at: string | null
    confidence_score: number
    explanation: string
    suggested_action: string
  }
  ledger: {
    expected_paisa: number
    actual_paisa: number
    delta_paisa: number
    currency: string
  }
  governance: {
    maker: MakerCheckerInfo | null
    checker: MakerCheckerInfo | null
    dual_control_enforced: boolean
  }
  evidence_pack: {
    native_settlement?: {
      settlement_id: string
      utr: string
      gross_paisa: number
      fee_paisa: number
      tax_paisa: number
      net_paisa: number
      settled_at: string
    }
    native_bank_entry?: {
      utr: string
      amount_paisa: number
      value_date: string
      bank_reference: string
    }
    native_payments: Array<{
      payment_id: string
      amount_paisa: number
      payment_method: string
      status: string
      captured_at: string
    }>
    attached_evidence_files: EvidenceFile[]
    extracted_transactions: ExtractedTransaction[]
  }
  cryptographic_seal: {
    latest_block_index: number | null
    latest_block_hash: string | null
    previous_block_hash: string | null
    audit_trail: Array<{
      index: number
      action: string
      reviewer: string
      timestamp: string
      block_hash: string
    }>
    chain_valid: boolean
    generated_at: string
  }
}

interface ExecutivePreviewModalProps {
  caseId: string
  isOpen: boolean
  onClose: () => void
}

export default function ExecutivePreviewModal({ caseId, isOpen, onClose }: ExecutivePreviewModalProps) {
  const [pack, setPack] = useState<ExecutivePackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState<number>(100)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  useEffect(() => {
    // Purge any stale pack data immediately upon modal toggle or caseId transition
    setPack(null)
    if (isOpen && caseId) {
      setLoading(true)
      fetchPack()
    } else {
      setLoading(false)
    }
  }, [isOpen, caseId])

  const fetchPack = async () => {
    setLoading(true)
    setPack(null)
    try {
      const res = await api.get(`/api/exceptions/${caseId}/executive-pack`)
      // Strict guard: only update pack if response matches current active caseId
      if (res.data?.case?.case_id === caseId) {
        setPack(res.data)
      }
    } catch (err) {
      // Error handled by interceptor
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPack(null)
    onClose()
  }

  const getDescriptiveBaseName = () => {
    const code = pack?.case?.exception_code ? pack.case.exception_code.replace(/ /g, '_') : 'AUDIT'
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `LedgerLens_Evidence_Pack_${caseId}_${code}_${dateStr}`
  }

  const handlePrint = () => {
    const sheet = document.getElementById('executive-report-a4-sheet')
    if (!sheet) return

    // Clean up any stale print mount point
    const existingMount = document.getElementById('ledgerlens-print-mount')
    if (existingMount) existingMount.remove()

    // Create a pristine, unconstrained mount container attached directly to document.body
    const printContainer = document.createElement('div')
    printContainer.id = 'ledgerlens-print-mount'
    printContainer.innerHTML = sheet.innerHTML
    printContainer.className = 'w-full bg-white p-6 font-sans text-slate-800 space-y-6'
    document.body.appendChild(printContainer)
    document.body.classList.add('ledgerlens-printing')

    const oldTitle = document.title
    const descriptiveName = getDescriptiveBaseName()
    document.title = descriptiveName

    const cleanup = () => {
      document.body.classList.remove('ledgerlens-printing')
      const m = document.getElementById('ledgerlens-print-mount')
      if (m) m.remove()
      document.title = oldTitle
      window.removeEventListener('afterprint', cleanup)
    }

    window.addEventListener('afterprint', cleanup)

    // Small delay ensures DOM update before browser renders print preview
    setTimeout(() => {
      window.print()
      setTimeout(cleanup, 2500)
    }, 60)
  }

  const handleDownloadPdf = async () => {
    if (!caseId) return
    setDownloadingPdf(true)
    const fileName = `${getDescriptiveBaseName()}.pdf`
    try {
      const res = await api.get(`/export/exception/${caseId}/pdf`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.setAttribute('download', fileName)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => window.URL.revokeObjectURL(url), 1000)
      toast.success(`Downloaded: ${fileName}`)
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleDownloadJson = () => {
    if (!pack) return
    const fileName = `${getDescriptiveBaseName()}.json`
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.setAttribute('download', fileName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Exported: ${fileName}`)
  }

  if (!isOpen || !caseId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto">
      {/* Print-Specific Stylesheet */}
      <style>{`
        @media print {
          /* 1. When printing via handlePrint mount point */
          body.ledgerlens-printing > *:not(#ledgerlens-print-mount) {
            display: none !important;
          }
          body.ledgerlens-printing {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            height: auto !important;
          }
          body.ledgerlens-printing #ledgerlens-print-mount {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          /* 2. Fallback when printing directly with browser shortcut (Ctrl+P) */
          body:not(.ledgerlens-printing) * {
            visibility: hidden !important;
          }
          body:not(.ledgerlens-printing) #executive-report-a4-sheet,
          body:not(.ledgerlens-printing) #executive-report-a4-sheet * {
            visibility: visible !important;
          }
          body:not(.ledgerlens-printing) html,
          body:not(.ledgerlens-printing) body,
          body:not(.ledgerlens-printing) #root,
          body:not(.ledgerlens-printing) .fixed,
          body:not(.ledgerlens-printing) .overflow-y-auto {
            overflow: visible !important;
            max-height: none !important;
            position: static !important;
            height: auto !important;
          }
          body:not(.ledgerlens-printing) #executive-report-a4-sheet {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          .page-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Main Container */}
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Interactive Non-Printable Top Toolbar */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Executive Evidence Pack</h3>
              <p className="text-xs text-slate-500 font-mono">Case ID: {caseId} • Regulatory Audit Snapshot</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setZoom(prev => Math.max(prev - 10, 80))}
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-mono font-bold w-12 text-center text-slate-600">{zoom}%</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setZoom(prev => Math.min(prev + 10, 130))}
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Button onClick={handleDownloadJson} variant="outline" size="sm" className="gap-2 bg-white text-slate-700">
              <Download className="h-4 w-4" /> JSON Export
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 bg-white text-slate-700">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button onClick={handleDownloadPdf} disabled={downloadingPdf} variant="default" size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm">
              <Download className="h-4 w-4" /> {downloadingPdf ? 'Downloading PDF...' : 'Download PDF'}
            </Button>
            <Button onClick={handleClose} variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-100/60 flex justify-center">
          {loading ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm text-slate-500 font-medium font-mono">Assembling cryptographic evidence pack for {caseId}...</p>
            </div>
          ) : (!pack || pack.case.case_id !== caseId) ? (
            <div className="py-20 text-center text-slate-500 font-mono text-xs">
              No executive evidence data available for {caseId}.
            </div>
          ) : (
            /* A4 Sheet Container */
            <div
              id="executive-report-a4-sheet"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
              className="w-[210mm] min-h-[297mm] bg-white border border-slate-200 shadow-md p-8 md:p-10 font-sans text-slate-800 space-y-6 transition-transform"
            >
              {/* Document Header */}
              <div className="border-b-2 border-slate-900 pb-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-slate-900 flex items-center justify-center text-white text-xs font-bold font-mono">
                        LG
                      </div>
                      <h1 className="text-xl font-extrabold tracking-tight text-slate-900">LEDGERLENS GUARD</h1>
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">
                      Financial Reconciliation & Incident Evidence Pack
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-300 font-mono">
                      RBI MASTER COMPLIANCE
                    </span>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">
                      Generated: {formatDateTime(pack.cryptographic_seal.generated_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Case Overview & Status Matrix */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Case Identifier</p>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{pack.case.case_id}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Portfolio Domain</p>
                  <p className="font-bold text-slate-900 mt-0.5">{pack.case.portfolio_id || 'GLOBAL'}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Anomaly Type</p>
                  <p className="font-bold text-red-600 mt-0.5">{(pack.case.exception_code || 'ANOMALY').replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Current Status</p>
                  <span className="inline-block font-bold text-slate-900 mt-0.5">{pack.case.status}</span>
                </div>
              </div>

              {/* Discrepancy Ledger Table */}
              <div className="space-y-2 page-break-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">1. Financial Discrepancy Ledger</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="p-2.5">Financial Metric</th>
                        <th className="p-2.5 text-right">Amount (INR)</th>
                        <th className="p-2.5 text-right">Integer Paisa</th>
                        <th className="p-2.5">Reconciliation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr>
                        <td className="p-2.5 font-sans font-medium text-slate-700">Expected Settlement Net</td>
                        <td className="p-2.5 text-right font-bold text-slate-900">{formatPaisa(pack.ledger.expected_paisa)}</td>
                        <td className="p-2.5 text-right text-slate-500">{pack.ledger.expected_paisa}</td>
                        <td className="p-2.5 font-sans text-slate-500">Gateway Reported</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-sans font-medium text-slate-700">Actual Bank Credit (UTR)</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">{formatPaisa(pack.ledger.actual_paisa)}</td>
                        <td className="p-2.5 text-right text-slate-500">{pack.ledger.actual_paisa}</td>
                        <td className="p-2.5 font-sans text-slate-500">CBS Statement Verified</td>
                      </tr>
                      <tr className="bg-red-50/50 font-bold">
                        <td className="p-2.5 font-sans text-red-900">Unresolved Discrepancy (Delta)</td>
                        <td className="p-2.5 text-right text-red-700">{formatPaisa(pack.ledger.delta_paisa)}</td>
                        <td className="p-2.5 text-right text-red-700">{pack.ledger.delta_paisa}</td>
                        <td className="p-2.5 font-sans text-red-700 uppercase tracking-widest text-[10px]">Variance Flagged</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Maker-Checker Governance & Dual Signatures */}
              <div className="space-y-2 page-break-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">2. Dual-Control Sign-Off Matrix</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Maker Card */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Maker Signature (1st Signer)</span>
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    </div>
                    {pack.governance.maker ? (
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-slate-900">{pack.governance.maker.email}</p>
                        <p className="text-slate-600 text-[11px] italic">"{pack.governance.maker.reason}"</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-1">
                          Signed: {pack.governance.maker.timestamp ? formatDateTime(pack.governance.maker.timestamp) : 'N/A'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Pending Maker Initiation</p>
                    )}
                  </div>

                  {/* Checker Card */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Checker Signature (Co-Signer)</span>
                      {pack.governance.checker ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Lock className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    {pack.governance.checker ? (
                      <div className="space-y-1 text-xs">
                        <p className="font-bold text-slate-900">{pack.governance.checker.email}</p>
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
                          Dual-Control Authorized ({pack.governance.checker.action})
                        </Badge>
                        <p className="text-[10px] font-mono text-slate-400 mt-1">
                          Co-signed: {pack.governance.checker.timestamp ? formatDateTime(pack.governance.checker.timestamp) : 'N/A'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 font-medium">Pending Senior Approver Co-signature</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Attached Evidence & Extracted Records */}
              <div className="space-y-2 page-break-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  3. Ingested Evidence & Extracted Transactions ({pack.evidence_pack.attached_evidence_files.length} Files Attached)
                </h3>
                {pack.evidence_pack.attached_evidence_files.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 italic">
                    No external dispute evidence documents have been uploaded to this case yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2">Document</th>
                          <th className="p-2">Format</th>
                          <th className="p-2">SHA-256 Digest</th>
                          <th className="p-2">Submitted By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {pack.evidence_pack.attached_evidence_files.map((file, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-sans font-medium text-slate-800">{file.filename || '—'}</td>
                            <td className="p-2 font-bold">{file.file_type || '—'}</td>
                            <td className="p-2 text-slate-500 truncate max-w-[160px]" title={file.file_sha256 || ''}>
                              {file.file_sha256 ? `${file.file_sha256.substring(0, 16)}...` : '—'}
                            </td>
                            <td className="p-2 font-sans">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-slate-800 font-medium">{file.uploaded_by}</span>
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-sans ${
                                  file.submitter_role === 'MAKER' ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold' :
                                  file.submitter_role === 'CHECKER' ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' :
                                  file.submitter_role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' :
                                  'bg-slate-50 text-slate-700 border-slate-200'
                                }`}>
                                  {file.submitter_role === 'MAKER' ? 'Reviewer (Maker)' :
                                   file.submitter_role === 'CHECKER' ? 'Admin (Checker)' :
                                   file.submitter_role === 'ADMIN' ? 'Admin' : 'Reviewer'}
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Extracted Records Table */}
                {pack.evidence_pack.extracted_transactions && pack.evidence_pack.extracted_transactions.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      Normalized Extracted Records Preview ({pack.evidence_pack.extracted_transactions.length} rows)
                    </p>
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-[10px] text-left">
                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0">
                          <tr>
                            <th className="p-1.5">UTR / Reference</th>
                            <th className="p-1.5">Net Amount</th>
                            <th className="p-1.5">Submitted By</th>
                            <th className="p-1.5">Source File</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {(pack?.evidence_pack?.extracted_transactions || []).slice(0, 15).map((tx, idx) => (
                            <tr key={idx}>
                              <td className="p-1.5 text-slate-800">{tx.utr || '—'}</td>
                              <td className="p-1.5 font-bold text-slate-900">{formatPaisa(tx.net_paisa)}</td>
                              <td className="p-1.5 font-sans text-slate-600 truncate max-w-[140px]">{tx.submitted_by || 'Reviewer'}</td>
                              <td className="p-1.5 font-sans text-slate-500 truncate max-w-[120px]">{tx.source_file}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Cryptographic Hash Chain Seal */}
              <div className="border-t-2 border-slate-900 pt-4 page-break-avoid">
                <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" />
                      <span className="font-bold tracking-wider text-white">CRYPTOGRAPHIC CHAIN SEAL</span>
                    </div>
                    <Badge variant="outline" className="border-emerald-500 text-emerald-300 text-[10px] bg-emerald-950/40">
                      {pack.cryptographic_seal.chain_valid ? 'CHAIN VERIFIED INTACT' : 'INTEGRITY TAMPER DETECTED'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] pt-1">
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase">Block Hash (SHA-256)</p>
                      <p className="text-emerald-300 truncate" title={pack.cryptographic_seal.latest_block_hash || 'N/A'}>
                        {pack.cryptographic_seal.latest_block_hash || 'GENESIS_HEAD'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase">Previous Block Link</p>
                      <p className="text-slate-300 truncate" title={pack.cryptographic_seal.previous_block_hash || '0'.repeat(64)}>
                        {pack.cryptographic_seal.previous_block_hash || '0'.repeat(64)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[9px] text-slate-400 font-sans pt-1 border-t border-slate-800">
                    This document is backed by forward-chained SHA-256 cryptographic hashes. Any unauthorized row modification breaks the mathematical seal and triggers automated system lockdown.
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
