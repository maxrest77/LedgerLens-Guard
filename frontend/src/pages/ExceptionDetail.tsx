import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import api from '../lib/api'
import { formatPaisa, formatDateTime } from '../lib/formatters'
import { ArrowLeft, AlertCircle, FileText, Download, ShieldCheck, X, Maximize2, Search } from 'lucide-react'
import { toast } from 'sonner'

export default function ExceptionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isHypothesisOpen, setIsHypothesisOpen] = useState(false)
  const [isEvidenceAnalysisOpen, setIsEvidenceAnalysisOpen] = useState(false)

  const buildForensicBriefing = () => {
    if (!data) return []
    const c = data.case
    const e = data.evidence || {}
    const sections: { title: string; content: string }[] = []

    // 1. Incident Summary
    const exceptionNames: Record<string, string> = {
      'DUPLICATE_UTR': 'Duplicate Bank Credit (UTR Collision)',
      'AMOUNT_MISMATCH': 'Settlement Amount Mismatch',
      'MISSING_SETTLEMENT': 'Orphaned Payment - No Settlement',
      'FEE_DEVIATION': 'Fee/Tax Calculation Deviation',
      'BANK_SETTLEMENT_MISMATCH': 'Bank vs Settlement Discrepancy',
      'MISSING_BANK_ENTRY': 'Settlement Without Bank Credit',
      'REFUND_EXCESS': 'Refund Exceeds Original Payment',
    }
    const friendlyName = exceptionNames[c.exception_code] || c.exception_code
    sections.push({
      title: 'Incident Summary',
      content: `A ${c.severity}-severity exception of type "${friendlyName}" (code: ${c.exception_code}) was automatically detected by the reconciliation engine. The system flagged case ${c.case_id} with a confidence score of ${(c.confidence_score * 100).toFixed(1)}%. The financial discrepancy (delta) stands at ${formatPaisa(c.delta_paisa)}.`
    })

    // 2. Timeline
    const timelineEvents: string[] = []
    if (e.payments?.length) {
      e.payments.forEach((p: any) => {
        timelineEvents.push(`Payment ${p.payment_id} of ${formatPaisa(p.amount_paisa)} was captured on ${formatDateTime(p.captured_at)} via ${p.payment_method} from customer ${p.customer_id} (bank: ${p.bank_code}).`)
      })
    }
    if (e.settlement) {
      timelineEvents.push(`Settlement ${e.settlement.settlement_id} was processed on ${formatDateTime(e.settlement.settled_at)} for a gross amount of ${formatPaisa(e.settlement.gross_paisa)}. After deducting fees of ${formatPaisa(e.settlement.fee_paisa)} and tax of ${formatPaisa(e.settlement.tax_paisa)}, the net settlement was ${formatPaisa(e.settlement.net_paisa)}.`)
    }
    if (e.bank_entry) {
      timelineEvents.push(`Bank statement shows a credit of ${formatPaisa(e.bank_entry.amount_paisa)} on ${e.bank_entry.value_date} against UTR ${e.bank_entry.utr} (Bank Ref: ${e.bank_entry.bank_reference}).`)
    }
    if (e.adjustments?.length) {
      e.adjustments.forEach((a: any) => {
        timelineEvents.push(`A ${a.type} adjustment of ${formatPaisa(a.amount_paisa)} was applied: "${a.reason}".`)
      })
    }
    timelineEvents.push(`Exception case ${c.case_id} was opened on ${formatDateTime(c.opened_at)} and is currently ${c.status}.`)
    if (c.resolved_at) {
      timelineEvents.push(`The case was resolved on ${formatDateTime(c.resolved_at)} by ${c.resolved_by} with action: ${c.status}.`)
    }
    sections.push({ title: 'Chronological Timeline', content: timelineEvents.join('\n\n') })

    // 3. Evidence Analysis
    const analysis: string[] = []
    if (c.exception_code === 'DUPLICATE_UTR') {
      analysis.push(`The UTR ${c.utr} appears in multiple bank statement entries. This is a critical red flag as each UTR should correspond to exactly one unique bank credit. The presence of duplicates indicates either a bank-side processing error resulting in a double credit, or a potential data integrity issue in the bank statement feed.`)
      if (e.bank_entry) {
        analysis.push(`The bank entry on record shows a credit of ${formatPaisa(e.bank_entry.amount_paisa)} on ${e.bank_entry.value_date}. If this UTR was credited more than once, the merchant may have received excess funds totaling ${formatPaisa(e.bank_entry.amount_paisa * 2)}, creating a liability risk.`)
      }
    } else if (c.exception_code === 'AMOUNT_MISMATCH' || c.exception_code === 'BANK_SETTLEMENT_MISMATCH') {
      analysis.push(`The system detected a discrepancy of ${formatPaisa(c.delta_paisa)} between the expected settlement amount (${formatPaisa(c.expected_paisa)}) and the actual bank credit (${formatPaisa(c.actual_paisa)}).`)
      if (e.settlement && e.bank_entry) {
        const diff = e.bank_entry.amount_paisa - e.settlement.net_paisa
        analysis.push(`The settlement file reports a net of ${formatPaisa(e.settlement.net_paisa)}, but the bank credited ${formatPaisa(e.bank_entry.amount_paisa)}. The variance of ${formatPaisa(diff)} could be caused by rounding differences, unaccounted adjustments, or an error in the fee calculation by the payment gateway.`)
      }
    } else if (c.exception_code === 'FEE_DEVIATION') {
      analysis.push(`The gateway-reported fees deviate from the expected fee schedule. The expected net was ${formatPaisa(c.expected_paisa)} but the actual net is ${formatPaisa(c.actual_paisa)}, creating a shortfall of ${formatPaisa(Math.abs(c.delta_paisa))}.`)
      if (e.settlement) {
        analysis.push(`Settlement ${e.settlement.settlement_id} reports fee of ${formatPaisa(e.settlement.fee_paisa)} and tax of ${formatPaisa(e.settlement.tax_paisa)} on a gross of ${formatPaisa(e.settlement.gross_paisa)}. The effective fee rate is ${((e.settlement.fee_paisa / e.settlement.gross_paisa) * 100).toFixed(3)}%.`)
      }
    } else {
      analysis.push(`The reconciliation engine identified a ${friendlyName} exception. Expected amount: ${formatPaisa(c.expected_paisa)}, actual amount: ${formatPaisa(c.actual_paisa)}, resulting in a delta of ${formatPaisa(c.delta_paisa)}.`)
    }
    if (e.adjustments?.length) {
      const totalAdj = e.adjustments.reduce((sum: number, a: any) => sum + a.amount_paisa, 0)
      analysis.push(`${e.adjustments.length} adjustment(s) totaling ${formatPaisa(totalAdj)} were applied to this settlement. These include: ${e.adjustments.map((a: any) => `${a.type} (${formatPaisa(a.amount_paisa)} - ${a.reason})`).join('; ')}. These deductions have been factored into the expected net calculation.`)
    }
    sections.push({ title: 'Evidence Analysis', content: analysis.join('\n\n') })

    // 4. Risk Assessment
    const risks: string[] = []
    if (c.severity === 'CRITICAL') {
      risks.push(`This is classified as CRITICAL severity. The financial exposure of ${formatPaisa(Math.abs(c.delta_paisa))} exceeds the threshold for automatic escalation. Immediate review by the finance team is required before settlement reconciliation can proceed.`)
    } else if (c.severity === 'HIGH') {
      risks.push(`This HIGH-severity exception represents a financial exposure of ${formatPaisa(Math.abs(c.delta_paisa))}. While not critical, it requires prompt attention to prevent accumulation of unreconciled balances.`)
    } else {
      risks.push(`This MEDIUM-severity exception has a financial impact of ${formatPaisa(Math.abs(c.delta_paisa))}. It should be reviewed in the normal workflow cycle.`)
    }
    risks.push(`The rule engine confidence score of ${(c.confidence_score * 100).toFixed(1)}% indicates ${c.confidence_score >= 0.9 ? 'very high certainty' : c.confidence_score >= 0.7 ? 'strong confidence' : 'moderate confidence'} in this classification. ${c.confidence_score < 0.7 ? 'Manual verification of the underlying data is strongly recommended.' : ''}`)
    sections.push({ title: 'Risk Assessment', content: risks.join('\n\n') })

    // 5. Recommended Action
    sections.push({
      title: 'Recommended Action',
      content: c.suggested_action
    })

    return sections
  }

  useEffect(() => {
    fetchCase()
  }, [id])

  const fetchCase = async () => {
    try {
      const res = await api.get(`/api/exceptions/${id}`)
      setData(res.data)
    } catch (err) {
      // Interceptor handles error
      navigate('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (action: 'APPROVE' | 'REJECT' | 'ESCALATE') => {
    if (reason.trim().length < 20 || reason.trim().split(/\s+/).length < 3) {
      toast.error('Reason must be at least 20 characters and contain at least 3 words.')
      return
    }
    
    if (action === 'APPROVE' && caseData?.suggested_action?.toUpperCase()?.includes('ESCALATE')) {
      if (!window.confirm('WARNING: The system recommends ESCALATION for this exception.\n\nAre you sure you want to FORCE APPROVE? This override will be permanently recorded in the audit chain.')) {
        return
      }
    }

    setSubmitting(true)
    try {
      await api.post(`/api/exceptions/${id}/review`, { action, reason })
      toast.success(`Case ${action}D and committed to audit chain.`)
      fetchCase() // Refresh
    } catch (err) {
      // Interceptor handles error
    } finally {
      setSubmitting(false)
      setReason('')
    }
  }

  const handleExportPDF = async () => {
    try {
      const res = await api.get(`/export/exception/${id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `exception_${id}_evidence.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      // Interceptor handles
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-32 bg-slate-200/50 rounded"></div>
        <div className="h-48 bg-slate-200/50 rounded-2xl"></div>
        <div className="h-64 bg-slate-200/50 rounded-2xl"></div>
      </div>
    )
  }

  if (!data) return null

  const { case: caseData } = data
  const isResolved = caseData.status !== 'OPEN'

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/workspace')} className="gap-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 -ml-4 transition-colors font-medium">
        <ArrowLeft className="h-4 w-4" /> Back to Workspace
      </Button>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/60 pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 flex items-center gap-3">
            Exception Detail
            <Badge variant="outline" className={`shadow-none font-bold border-transparent ${caseData.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : caseData.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {caseData.severity}
            </Badge>
            <Badge variant="outline" className={`shadow-none font-bold ${
              !isResolved ? 'bg-white border-slate-200 text-slate-700' :
              caseData.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
              caseData.status === 'AUTO_RESOLVED' ? 'bg-blue-100 text-blue-700 border-blue-200' :
              caseData.status === 'REJECTED' ? 'bg-red-100 text-red-700 border-red-200' :
              'bg-yellow-100 text-yellow-700 border-yellow-200'
            }`}>
              {caseData.status}
            </Badge>
          </h2>
          <p className="font-mono text-sm text-slate-500 tracking-tight">Case Identifier: <span className="text-slate-800 font-bold bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm ml-1">{caseData.case_id?.split('_').pop()}</span></p>
        </div>
        <Button variant="outline" onClick={handleExportPDF} className="gap-2 shadow-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold h-10">
          <Download className="h-4 w-4" /> Export Evidence (PDF)
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Trace & Details */}
        <div className="lg:col-span-2 space-y-8">

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" /> Exception Hypothesis
            </h3>
            <div 
              className="px-5 py-4 bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl shadow-sm relative overflow-hidden cursor-pointer group hover:border-blue-300 hover:shadow-md transition-all"
              onClick={() => setIsHypothesisOpen(true)}
            >
               <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
              <p className="relative z-10 text-sm leading-relaxed text-slate-700 font-medium line-clamp-2">
                {caseData.explanation}
              </p>
              <div className="relative z-10 mt-3 flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="h-3 w-3" /> View Detailed Hypothesis
              </div>
            </div>
          </section>

          {/* Evidence Pack - The Proof */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" /> Evidence Pack - Source Records
              </h3>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] font-bold uppercase tracking-wider gap-1.5 bg-white border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 shadow-sm rounded-lg transition-all"
                onClick={() => setIsEvidenceAnalysisOpen(true)}
              >
                <Search className="h-3 w-3" /> View Full Analysis
              </Button>
            </div>
            <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-200/60">
              
              {/* Settlement Record */}
              {data.evidence?.settlement && (
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Settlement Record</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium">Settlement ID</p>
                      <p className="text-slate-800 font-mono font-bold truncate" title={data.evidence.settlement.settlement_id}>{data.evidence.settlement.settlement_id}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Gross</p>
                      <p className="text-slate-800 font-mono font-bold">{formatPaisa(data.evidence.settlement.gross_paisa)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Fee + Tax</p>
                      <p className="text-slate-800 font-mono font-bold">{formatPaisa(data.evidence.settlement.fee_paisa + data.evidence.settlement.tax_paisa)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Net Settlement</p>
                      <p className="text-emerald-700 font-mono font-bold">{formatPaisa(data.evidence.settlement.net_paisa)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Payments */}
              {data.evidence?.payments?.length > 0 && (
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Linked Payments ({data.evidence.payments.length})</p>
                  <div className="space-y-2">
                    {data.evidence.payments.map((p: any) => (
                      <div key={p.payment_id} className="flex items-center justify-between bg-slate-50/80 rounded-lg px-3 py-2.5 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-slate-800 font-bold truncate max-w-[180px]" title={p.payment_id}>{p.payment_id}</span>
                          <Badge variant="outline" className="text-[10px] shadow-none border-slate-200 bg-white font-bold">{p.payment_method}</Badge>
                          <Badge variant="outline" className={`text-[10px] shadow-none font-bold ${p.status === 'CAPTURED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : p.status === 'REFUNDED' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{p.status}</Badge>
                        </div>
                        <span className="font-mono text-xs text-slate-900 font-bold">{formatPaisa(p.amount_paisa)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bank Entry */}
              {data.evidence?.bank_entry && (
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bank Statement Entry</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium">UTR</p>
                      <p className="text-slate-800 font-mono font-bold">{data.evidence.bank_entry.utr}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Credited Amount</p>
                      <p className="text-emerald-700 font-mono font-bold">{formatPaisa(data.evidence.bank_entry.amount_paisa)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Value Date</p>
                      <p className="text-slate-800 font-mono font-bold">{data.evidence.bank_entry.value_date}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Bank Ref</p>
                      <p className="text-slate-800 font-mono font-bold truncate" title={data.evidence.bank_entry.bank_reference}>{data.evidence.bank_entry.bank_reference}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Adjustments */}
              {data.evidence?.adjustments?.length > 0 && (
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjustments / Deductions ({data.evidence.adjustments.length})</p>
                  <div className="space-y-2">
                    {data.evidence.adjustments.map((a: any) => (
                      <div key={a.adjustment_id} className="flex items-center justify-between bg-slate-50/80 rounded-lg px-3 py-2.5 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-[10px] shadow-none bg-red-50 text-red-700 border-red-200 font-bold">{a.type}</Badge>
                          <span className="text-xs text-slate-600 font-medium truncate max-w-[200px]">{a.reason}</span>
                        </div>
                        <span className="font-mono text-xs text-red-600 font-bold">-{formatPaisa(a.amount_paisa)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!data.evidence?.settlement && !data.evidence?.payments?.length && !data.evidence?.bank_entry && (
                <div className="p-6 text-center text-sm text-slate-400 font-medium">
                  No linked source records found for this exception.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" /> Calculation Trace
            </h3>
            <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
              <div className="space-y-0 font-mono text-sm divide-y divide-slate-200/60">
                <div className="flex justify-between items-center p-4 hover:bg-white/50 transition-colors">
                  <span className="text-slate-500 font-medium">Expected Net Settlement</span>
                  <span className="text-slate-800 font-bold">{formatPaisa(caseData.expected_paisa)}</span>
                </div>
                <div className="flex justify-between items-center p-4 hover:bg-white/50 transition-colors">
                  <span className="text-slate-500 font-medium">Actual Bank Credit</span>
                  <span className="text-slate-800 font-bold">{formatPaisa(caseData.actual_paisa)}</span>
                </div>
                <div className="flex justify-between items-center p-5 bg-slate-50/80 backdrop-blur-md border-t border-slate-200/60">
                  <span className="text-slate-800 font-bold tracking-widest uppercase text-xs">Discrepancy (Delta)</span>
                  <span className={`text-base font-extrabold tracking-tight ${caseData.delta_paisa !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatPaisa(caseData.delta_paisa)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Forensic Identifiers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">Settlement ID</p>
                <p className="font-mono text-sm text-slate-800 font-semibold break-all">{caseData.settlement_id || 'N/A'}</p>
              </div>
              <div className="p-4 bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">UTR</p>
                <p className="font-mono text-sm text-slate-800 font-semibold break-all">{caseData.utr || 'N/A'}</p>
              </div>
              <div className="p-4 bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">Payment ID</p>
                <p className="font-mono text-sm text-slate-800 font-semibold break-all">{caseData.payment_id || 'N/A'}</p>
              </div>
              <div className="p-4 bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">Exception Code</p>
                <p className="font-mono text-sm text-red-600 font-bold break-all">{caseData.exception_code}</p>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column: Review Action */}
        <div className="space-y-6">
          <Card className={`bg-white/80 backdrop-blur-2xl shadow-lg border-slate-200/60 rounded-2xl overflow-hidden relative ${!isResolved ? 'ring-2 ring-blue-500/20' : ''}`}>
             <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent pointer-events-none" />
             <div className="relative z-10">
              <CardHeader className="bg-slate-50/50 border-b border-slate-200/40 pb-4">
                  <CardTitle className="text-slate-900 text-lg font-bold">Reviewer Action</CardTitle>
                  <CardDescription className="mt-3 flex flex-col gap-2 items-start">
                    <span className="text-sm text-slate-600 font-medium">System Suggestion:</span>
                    <strong className="text-slate-800 font-mono bg-white border border-slate-200 p-2.5 rounded-lg shadow-sm text-xs leading-relaxed inline-block break-words max-w-full w-full">
                      {caseData.suggested_action}
                    </strong>
                  </CardDescription>
                </CardHeader>
              <CardContent className="pt-6">
                {isResolved ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-white/60 rounded-xl border border-slate-200/60 shadow-sm">
                      <ShieldCheck className="h-5 w-5 text-emerald-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-slate-800">Resolved by {caseData.resolved_by}</p>
                        <p className="text-xs text-slate-500 mb-3 font-mono font-medium">{formatDateTime(caseData.resolved_at)}</p>
                        <div className="text-sm text-slate-700 mb-3 font-medium flex items-center">
                          Action taken: <Badge variant="secondary" className="shadow-none bg-slate-100 border-slate-200 text-slate-700 ml-2 font-bold">{caseData.status}</Badge>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 font-bold pt-3 border-t border-slate-200/60 uppercase tracking-widest">
                          Audit Block Index: #{caseData.audit_block_id}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-slate-700">Review Reason / Notes</label>
                        <span className={`text-[10px] font-bold ${reason.trim().length < 20 ? 'text-red-500' : 'text-emerald-500'}`}>
                          {reason.trim().length}/20 characters required
                        </span>
                      </div>
                      <Textarea 
                        placeholder="Required justification for cryptographic audit trail (min. 20 chars, industrial standards enforced)..." 
                        className="bg-white/70 border-slate-200 min-h-[120px] shadow-sm resize-none focus-visible:ring-blue-500 text-slate-900 font-medium placeholder:text-slate-400 rounded-xl"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <Button 
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-bold rounded-lg h-11" 
                        onClick={() => handleReview('APPROVE')}
                        disabled={submitting || reason.trim().length < 20 || reason.trim().split(/\s+/).length < 3 || caseData.severity === 'CRITICAL'}
                      >
                        {caseData.severity === 'CRITICAL' ? 'Approval Blocked (CRITICAL Severity)' : 'Approve Match (Force)'}
                      </Button>
                      <Button 
                        variant="outline" 
                        className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 shadow-sm font-bold rounded-lg h-11"
                        onClick={() => handleReview('REJECT')}
                        disabled={submitting || reason.trim().length < 20 || reason.trim().split(/\s+/).length < 3}
                      >
                        Reject
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="w-full shadow-sm font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg h-11"
                        onClick={() => handleReview('ESCALATE')}
                        disabled={submitting || reason.trim().length < 20 || reason.trim().split(/\s+/).length < 3}
                      >
                        Escalate to Finance
                      </Button>
                    </div>
                    <p className="text-[10px] text-center text-slate-500 font-bold mt-4 uppercase tracking-widest">
                      Actions are permanently written to the hash chain.
                    </p>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        </div>
      </div>

      {isHypothesisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsHypothesisOpen(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" /> Detailed Hypothesis
              </h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-200 transition-colors" onClick={() => setIsHypothesisOpen(false)}>
                <X className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto space-y-5">
              {caseData.explanation.split('. ').map((para: string, idx: number, arr: string[]) => {
                const text = para.trim()
                if (!text) return null
                return (
                  <p key={idx} className="text-base md:text-lg leading-relaxed text-slate-700 font-medium">
                    {text}{text.endsWith('.') ? '' : '.'}
                  </p>
                )
              })}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button onClick={() => setIsHypothesisOpen(false)} className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg px-8 h-11 shadow-sm">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {isEvidenceAnalysisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsEvidenceAnalysisOpen(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-600" /> Forensic Evidence Analysis
              </h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-200 transition-colors" onClick={() => setIsEvidenceAnalysisOpen(false)}>
                <X className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto space-y-6">
              {buildForensicBriefing().map((section, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-900 text-white text-[10px] font-bold shrink-0">{idx + 1}</span>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{section.title}</h4>
                  </div>
                  <div className="pl-9 space-y-3">
                    {section.content.split('\n\n').map((para, pIdx) => (
                      <p key={pIdx} className="text-sm leading-relaxed text-slate-600 font-medium">
                        {para}
                      </p>
                    ))}
                  </div>
                  {idx < buildForensicBriefing().length - 1 && (
                    <div className="border-b border-slate-100 mt-4" />
                  )}
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button onClick={() => setIsEvidenceAnalysisOpen(false)} className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg px-8 h-11 shadow-sm">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
