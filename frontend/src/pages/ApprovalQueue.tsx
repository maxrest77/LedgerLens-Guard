import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import { ShieldAlert, ExternalLink, FileText } from 'lucide-react'
import { formatPaisa, formatDateTime } from '../lib/formatters'
import { useNavigate } from 'react-router-dom'
import type { CaseDetail } from './Workspace'
import ExecutivePreviewModal from '../components/evidence/ExecutivePreviewModal'

export default function ApprovalQueue() {
  const [cases, setCases] = useState<CaseDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [previewCaseId, setPreviewCaseId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchEscalations()
  }, [])
  
  const fetchEscalations = async () => {
    try {
      const res = await api.get('/api/admin/escalations')
      setCases(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-slate-500 font-mono text-sm">Loading Approval Queue...</div>
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Approval Queue</h1>
          <p className="text-sm text-slate-500 mt-1">Maker-Checker escalations requiring Admin review.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg">Pending Cases</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {cases.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm font-medium">Queue is completely clear.</div>
            ) : (
              <div className="divide-y divide-slate-200/60">
                {cases.map((c: any) => (
                  <div key={c.case_id} className="p-6 hover:bg-white/50 transition-colors flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center border border-amber-100 shrink-0">
                        <ShieldAlert className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="flex gap-2 items-center mb-1">
                          <span className="font-bold text-slate-900">{c.exception_code.replace(/_/g, ' ')}</span>
                          <Badge variant="warning">{c.status}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 font-mono">Case: {c.case_id} | Opened: {formatDateTime(c.opened_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">{formatPaisa(c.delta_paisa)}</p>
                        <p className="text-xs text-slate-500 font-mono">Exposure</p>
                      </div>
                      <Button onClick={() => setPreviewCaseId(c.case_id)} variant="outline" size="sm" className="gap-2 text-slate-700 bg-white">
                        <FileText className="h-4 w-4 text-blue-600" /> Executive Pack
                      </Button>
                      <Button onClick={() => navigate(`/exceptions/${c.case_id}`)} variant="default" size="sm" className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                        Review Case <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* In-App Executive Pack Print Preview Modal */}
      {previewCaseId && (
        <ExecutivePreviewModal
          key={previewCaseId}
          caseId={previewCaseId}
          isOpen={!!previewCaseId}
          onClose={() => setPreviewCaseId(null)}
        />
      )}
    </div>
  )
}
