import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import { formatPaisa } from '../lib/formatters'
import { Download, Search, ChevronRight, ChevronLeft } from 'lucide-react'

export interface CaseDetail {
  case_id: string
  exception_code: string
  severity: string
  settlement_id: string
  payment_id: string
  utr: string
  expected_paisa: number
  actual_paisa: number
  delta_paisa: number
  confidence_score: number
  explanation: string
  suggested_action: string
  status: string
  opened_at: string
}

interface CasesData {
  items: CaseDetail[]
  total: number
}

export default function Workspace() {
  const [data, setData] = useState<CasesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const limit = 20

  useEffect(() => {
    fetchData()
  }, [page])

  const fetchData = async (searchQuery = search) => {
    setLoading(true)
    try {
      const res = await api.get(`/api/workspace?page=${page}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ''}`)
      setData(res.data)
    } catch (err) {
      // Error handled by interceptor
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchData(search)
  }

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/export/batch/csv', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'reconciliation_export.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      // Interceptor handles
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 shadow-none font-bold text-[10px]">CRITICAL</Badge>
      case 'HIGH': return <Badge variant="destructive" className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 shadow-none font-bold text-[10px]">HIGH</Badge>
      case 'MEDIUM': return <Badge variant="warning" className="bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100 shadow-none font-bold text-[10px]">MEDIUM</Badge>
      case 'INFO': return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 shadow-none font-bold text-[10px]">INFO</Badge>
      default: return <Badge variant="outline" className="shadow-none font-bold text-[10px]">{severity}</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN': return <Badge variant="outline" className="bg-slate-50 border-slate-300 text-slate-700 font-bold shadow-none text-[10px]">OPEN</Badge>
      case 'APPROVED': return <Badge variant="success" className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-none font-bold text-[10px]">APPROVED</Badge>
      case 'REJECTED': return <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 shadow-none font-bold text-[10px]">REJECTED</Badge>
      case 'ESCALATED': return <Badge variant="warning" className="bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100 shadow-none font-bold text-[10px]">ESCALATED</Badge>
      case 'AUTO_RESOLVED': return <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-none font-bold text-[10px]">AUTO_RESOLVED</Badge>
      default: return <Badge variant="outline" className="shadow-none font-bold text-[10px]">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end pb-4 border-b border-slate-200/60">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Reconciliation Workspace</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Review and resolve detected exceptions.</p>
        </div>
        <Button variant="outline" onClick={handleExportCSV} className="gap-2 bg-white hover:bg-slate-50 text-slate-700 shadow-sm border-slate-200 font-semibold h-10">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 p-6 rounded-2xl relative overflow-hidden">
        {/* Subtle glass gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />

        <div className="relative z-10">
          <form onSubmit={handleSearch} className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search by UTR or Payment ID..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/70 backdrop-blur-sm border-slate-200 shadow-sm font-medium text-slate-900 h-10 rounded-lg placeholder:text-slate-400 focus-visible:ring-blue-500"
              />
            </div>
            <Button type="submit" variant="secondary" className="shadow-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold h-10 px-6 rounded-lg">Search</Button>
          </form>

          <div className="rounded-xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/60">
            <Table>
              <TableHeader className="bg-slate-50/50 backdrop-blur-sm">
                <TableRow className="border-slate-200/60 hover:bg-transparent">
                  <TableHead className="w-[110px] font-bold text-xs uppercase tracking-widest text-slate-500">Case ID</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-500">Code</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-500">Severity</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-500">UTR / Payment</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-widest text-slate-500">Expected</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-widest text-slate-500">Delta</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest text-slate-500">Status</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <TableRow key={i} className="border-slate-200/60">
                      <TableCell colSpan={8} className="p-4">
                        <div className="h-6 bg-slate-200/50 rounded animate-pulse w-full"></div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : data?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-64">
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-800">No records found</h3>
                          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                            We couldn't find any exceptions matching {search ? 'your search' : 'the criteria'}. Please check the Payment ID or UTR and try again.
                          </p>
                        </div>
                        {search && (
                          <Button 
                            variant="outline" 
                            className="mt-2 bg-white font-semibold text-slate-700 shadow-sm hover:bg-slate-50" 
                            onClick={() => {
                              setSearch('')
                              setPage(1)
                              fetchData('')
                            }}
                          >
                            Clear Search
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data?.map((c: any) => (
                    <TableRow 
                      key={c.case_id} 
                      className="border-slate-200/60 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/exceptions/${c.case_id}`)}
                    >
                      <TableCell className="p-3">
                        <span className="font-mono text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 shadow-sm block w-max">
                          {c.case_id?.split('_').pop()}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-sm text-slate-800 p-3">{c.exception_code}</TableCell>
                      <TableCell className="p-3">{getSeverityBadge(c.severity)}</TableCell>
                      <TableCell className="font-mono text-xs font-medium text-slate-500 p-3">
                        {c.utr || c.payment_id || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-700 p-3">{formatPaisa(c.expected_paisa)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-bold p-3 ${c.delta_paisa < 0 ? 'text-red-600' : c.delta_paisa > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {formatPaisa(c.delta_paisa)}
                      </TableCell>
                      <TableCell className="p-3">{getStatusBadge(c.status)}</TableCell>
                      <TableCell className="p-3 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-6 px-1">
              <p className="text-sm font-medium text-slate-500">
                Showing page {data.pagination.page} of {data.pagination.pages} <span className="opacity-60">({data.pagination.total} cases)</span>
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 font-semibold"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 font-semibold"
                  disabled={page === data.pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
