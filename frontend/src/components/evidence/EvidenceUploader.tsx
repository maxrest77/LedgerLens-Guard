import { useState, useRef, useEffect } from 'react'
import { UploadCloud, CheckCircle2, RefreshCw, FileText, Paperclip, Trash2, AlertCircle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { formatPaisa, formatDateTime } from '../../lib/formatters'
import api from '../../lib/api'
import { toast } from 'sonner'

interface ExtractedRecord {
  record_index: number
  utr: string
  amount_paisa: number
  fee_paisa: number
  tax_paisa: number
  net_paisa: number
  timestamp?: string
  masked_account_or_pan?: string
  narrative?: string
}

interface UploadResponseData {
  status: string
  attachment_id: number
  filename: string
  file_type: string
  file_sha256: string
  uploaded_by?: string
  submitter_role?: string
  is_committed?: boolean
  audit_block_index?: number
  summary: {
    total_records: number
    total_amount_paisa: number
    net_amount_paisa: number
    pci_masked_count: number
  }
  extracted_records: ExtractedRecord[]
}

interface ExistingAttachment {
  id: number
  filename: string
  file_type: string
  file_size_bytes: number
  file_sha256: string
  uploaded_by: string
  submitter_role?: string
  uploaded_at: string
  audit_block_id: number | null
  is_committed: boolean
  records_count?: number
  preview_records?: ExtractedRecord[]
}

interface EvidenceUploaderProps {
  caseId: string
  caseStatus?: string
  onUploadSuccess?: () => void
}

export default function EvidenceUploader({ caseId, caseStatus, onUploadSuccess }: EvidenceUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lastUpload, setLastUpload] = useState<UploadResponseData | null>(null)
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([])
  const [expandedAttachmentId, setExpandedAttachmentId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCaseClosed = ['APPROVED', 'REJECTED', 'AUTO_RESOLVED'].includes(caseStatus || '')

  useEffect(() => {
    // Reset staged preview and expanded proof whenever switching cases or status
    setLastUpload(null)
    setExpandedAttachmentId(null)
    if (caseId) {
      fetchAttachments()
    }

    return () => {
      // Discard uncommitted staged evidence when navigating away from this case
      if (caseId) {
        api.delete(`/api/exceptions/${caseId}/evidence/staged`).catch(() => {})
      }
    }
  }, [caseId, caseStatus])

  const fetchAttachments = async () => {
    try {
      const res = await api.get(`/api/exceptions/${caseId}/evidence`)
      setExistingAttachments(res.data.data || [])
    } catch {
      // Handled silently
    }
  }

  const handleDiscardStaged = async () => {
    if (!caseId) return
    try {
      await api.delete(`/api/exceptions/${caseId}/evidence/staged`)
      setLastUpload(null)
      toast.info('Staged proof discarded')
    } catch {
      setLastUpload(null)
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (isCaseClosed) {
      toast.error('Cannot upload evidence to a closed or resolved case.')
      return
    }
    if (!files || files.length === 0) return
    const file = files[0]

    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)
    try {
      // Omit explicit Content-Type header so Axios/browser sets boundary correctly
      const res = await api.post(`/api/exceptions/${caseId}/evidence/upload`, formData)
      setLastUpload(res.data)
      toast.success(`Staged ${file.name} for review`)
      fetchAttachments()
      if (onUploadSuccess) {
        onUploadSuccess()
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to upload evidence file'
      toast.error(msg)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-4">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".csv,.tsv,.xlsx,.xml,.txt,.dat,.pdf,.png,.jpg,.jpeg,.bai,.bai2"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Dropzone or Closed Notice */}
      {isCaseClosed ? (
        <div className="border border-slate-200 bg-slate-50/80 rounded-2xl p-5 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Case is resolved ({caseStatus}). Review evidence attachments are permanently sealed.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Senior Approver / Checker Guidance Banner */}
          {caseStatus === 'PENDING_CO_REVIEW' && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/90 border border-indigo-200 text-xs text-indigo-950 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-bold">Senior Approver / Checker Review Mode</p>
                  <p className="text-slate-600 text-[11px]">Inspect the Maker's attached proof above. You may also attach additional verification evidence below before co-signing.</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-indigo-100 border-indigo-300 text-indigo-800 text-[10px] font-semibold shrink-0">
                Checker Review
              </Badge>
            </div>
          )}

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                {uploading ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <UploadCloud className="h-6 w-6" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {uploading ? 'Parsing & Encrypting Document...' : 'Upload Evidence Document or Settlement Feed'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Drag and drop files here, or click Browse to select
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  Supports CSV, TSV, XLSX, ISO 20022 (camt.053), SWIFT MT940, BAI2 (.bai, .bai2), and Advice Slips
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                  className="gap-2 bg-white text-slate-700 shadow-sm"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading...' : 'Browse Files'}
                </Button>
                <Badge variant="outline" className="text-[10px] font-mono text-slate-500 border-slate-200 bg-white shadow-none">
                  In-Memory PCI-DSS Sanitized • Staged Until Submit
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Existing Permanently Attached Evidence Files */}
      {existingAttachments.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            Permanently Attached Evidence Files ({existingAttachments.length})
          </p>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white/90 divide-y divide-slate-100 shadow-xs">
            {existingAttachments.map((att) => {
              const isMaker = att.submitter_role === 'MAKER'
              const isChecker = att.submitter_role === 'CHECKER'
              const isAdmin = att.submitter_role === 'ADMIN'
              const isExpanded = expandedAttachmentId === att.id

              return (
                <div key={att.id} className="p-4 space-y-3 text-xs hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900">{att.filename}</p>
                          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-sans ${
                            isMaker ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' :
                            isChecker ? 'bg-purple-50 text-purple-700 border-purple-200 font-bold' :
                            isAdmin ? 'bg-purple-50 text-purple-700 border-purple-200 font-bold' :
                            'bg-slate-100 text-slate-700 border-slate-200 font-medium'
                          }`}>
                            {isMaker ? 'Reviewer (Maker)' :
                             isChecker ? 'Admin (Checker)' :
                             isAdmin ? 'Admin' : 'Reviewer'}: {att.uploaded_by}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Format: {att.file_type} • {(att.file_size_bytes / 1024).toFixed(1)} KB • Block #{att.audit_block_id ?? 'N/A'} • Uploaded {formatDateTime(att.uploaded_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <Badge variant="outline" className="text-[10px] font-mono border-slate-200 text-slate-600 bg-slate-50">
                        SHA: {att.file_sha256 ? `${att.file_sha256.substring(0, 8)}...` : '—'}
                      </Badge>
                      {att.preview_records && att.preview_records.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-slate-600 hover:text-slate-900 gap-1 px-2.5 font-medium border border-slate-200 bg-white"
                          onClick={() => setExpandedAttachmentId(prev => prev === att.id ? null : att.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                          {isExpanded ? 'Hide Records' : `View Records (${att.records_count || att.preview_records.length})`}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Extracted Records Table */}
                  {isExpanded && att.preview_records && att.preview_records.length > 0 && (
                    <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          Extracted Records Preview ({att.preview_records.length} shown)
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Submitted by {att.uploaded_by}
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0">
                            <tr>
                              <th className="p-2">UTR / RRN</th>
                              <th className="p-2">Net Amount</th>
                              <th className="p-2">Fee</th>
                              <th className="p-2">Tax</th>
                              <th className="p-2">Date</th>
                              <th className="p-2">Account / PAN</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {att.preview_records.map((r, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50/80">
                                <td className="p-2 font-bold text-slate-800">{r.utr || '—'}</td>
                                <td className="p-2 font-bold text-emerald-700">{formatPaisa(r.net_paisa || r.amount_paisa)}</td>
                                <td className="p-2 text-slate-600">{formatPaisa(r.fee_paisa || 0)}</td>
                                <td className="p-2 text-slate-600">{formatPaisa(r.tax_paisa || 0)}</td>
                                <td className="p-2 text-slate-500">{r.timestamp ? r.timestamp.slice(0, 10) : '—'}</td>
                                <td className="p-2 text-slate-500">{r.masked_account_or_pan || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Staged Draft Extraction Results Preview */}
      {lastUpload && (
        <Card className="border-amber-200 bg-amber-50/30 rounded-2xl overflow-hidden shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{lastUpload.filename}</h4>
                    <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-100/80 text-amber-900 font-semibold">
                      Provisional Staged Proof
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Format: {lastUpload.file_type} • Staged by {lastUpload.uploaded_by || 'You'} ({lastUpload.submitter_role === 'CHECKER' ? 'Admin / Checker' : lastUpload.submitter_role === 'MAKER' ? 'Reviewer / Maker' : 'Reviewer'})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono border-slate-200 bg-white text-slate-700">
                  SHA-256: {lastUpload.file_sha256 ? `${lastUpload.file_sha256.substring(0, 10)}...` : '—'}
                </Badge>
                <Button
                  onClick={handleDiscardStaged}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5 px-2.5 font-semibold"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Discard
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-100/70 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
              <span>
                <strong>Draft Staging:</strong> This document is staged for review preview. It will be permanently committed to the case and sealed into the cryptographic audit chain only when you submit your review (Approve / Reject). Navigating away or moving to another case will discard it.
              </span>
            </div>

            {/* Metrics Chips */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white/80 p-3 rounded-xl border border-slate-200/60 font-mono">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold font-sans">Extracted Records</p>
                <p className="font-bold text-slate-900 mt-0.5">{lastUpload.summary.total_records}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold font-sans">Gross Normalized</p>
                <p className="font-bold text-emerald-700 mt-0.5">{formatPaisa(lastUpload.summary.total_amount_paisa)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold font-sans">Net Normalized</p>
                <p className="font-bold text-slate-900 mt-0.5">{formatPaisa(lastUpload.summary.net_amount_paisa)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold font-sans">PCI Masked PANs</p>
                <p className="font-bold text-blue-700 mt-0.5">{lastUpload.summary.pci_masked_count}</p>
              </div>
            </div>

            {/* Extracted Rows Table Preview */}
            {lastUpload.extracted_records.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  Extracted Normalized Records Preview
                </p>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">UTR / Ref</th>
                        <th className="p-2 text-right">Gross Amount</th>
                        <th className="p-2 text-right">Net Amount</th>
                        <th className="p-2">Masked Card / PAN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {(lastUpload?.extracted_records || []).slice(0, 5).map((rec) => (
                        <tr key={rec.record_index}>
                          <td className="p-2 text-slate-400">{rec.record_index}</td>
                          <td className="p-2 font-bold text-slate-800">{rec.utr}</td>
                          <td className="p-2 text-right text-slate-900">{formatPaisa(rec.amount_paisa)}</td>
                          <td className="p-2 text-right text-emerald-700">{formatPaisa(rec.net_paisa)}</td>
                          <td className="p-2 text-slate-500 font-sans">{rec.masked_account_or_pan || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
