import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import api from '../lib/api'
import { ShieldCheck, AlertTriangle, Activity, Zap } from 'lucide-react'
import { formatPaisa, formatDateTime } from '../lib/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/api/dashboard')
        setData(res.data)
      } catch (err) {
        // Interceptor handles
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200/50 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-200/50 rounded-2xl animate-pulse"></div>
          ))}
        </div>
        <div className="h-64 bg-slate-200/50 rounded-2xl animate-pulse"></div>
      </div>
    )
  }

  if (!data) return null

  const { kpis, risk_signals, chart_data, recent_activity } = data

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end pb-4 border-b border-slate-200/60">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Reconciliation system health and exceptions overview.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Health Rate</CardTitle>
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{kpis.health_rate}%</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Matched automatically</p>
            </CardContent>
          </div>
        </Card>
        
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Expected Net</CardTitle>
              <Zap className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-2xl xl:text-3xl font-extrabold text-slate-900 tracking-tighter truncate" title={formatPaisa(kpis.expected_net_paisa)}>{formatPaisa(kpis.expected_net_paisa)}</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Across {kpis.total_cases} cases</p>
            </CardContent>
          </div>
        </Card>
        
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Unresolved Delta</CardTitle>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-2xl xl:text-3xl font-extrabold text-red-600 tracking-tighter truncate" title={formatPaisa(kpis.unresolved_delta_paisa)}>{formatPaisa(kpis.unresolved_delta_paisa)}</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Requires reviewer action</p>
            </CardContent>
          </div>
        </Card>
        
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden hover:shadow-md transition-all relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-slate-200/30">
              <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Open Cases</CardTitle>
              <Activity className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-2xl xl:text-3xl font-extrabold text-slate-900 tracking-tight">{kpis.open_cases}</div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Pending review</p>
            </CardContent>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Signals */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col">
            <CardHeader className="border-b border-slate-200/40 bg-slate-50/50 pb-4">
              <CardTitle className="text-slate-900 text-lg font-bold">Active Risk Signals</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto max-h-[350px]">
              {risk_signals.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm font-medium">No active risk signals detected.</div>
              ) : (
                <div className="divide-y divide-slate-200/60">
                  {risk_signals.map((signal: any, i: number) => (
                    <div key={i} className="p-5 hover:bg-white/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800">{signal.type}</span>
                        <Badge variant="outline" className={`shadow-none font-bold text-[10px] ${signal.severity === 'HIGH' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                          {signal.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{signal.detail}</p>
                      {signal.date && <p className="text-xs text-slate-400 font-mono mt-3">{signal.date}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Charts */}
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col">
            <CardHeader className="border-b border-slate-200/40 bg-slate-50/50 pb-4">
              <CardTitle className="text-slate-900 text-lg font-bold">Exceptions by Code</CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex-1 flex items-center justify-center">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="code" stroke="#64748b" fontSize={12} tickFormatter={(val) => val.replace(/_/g, ' ')} tickMargin={10} />
                    <YAxis stroke="#64748b" fontSize={12} tickMargin={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', fontSize: '13px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ color: '#dc2626', fontWeight: 'bold' }}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <CardHeader className="border-b border-slate-200/40 bg-slate-50/50 pb-4">
            <CardTitle className="text-slate-900 text-lg font-bold">Recent Reviewer Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent_activity.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm font-medium">No recent activity.</div>
            ) : (
              <div className="divide-y divide-slate-200/60">
                {recent_activity.map((act: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 md:px-6 hover:bg-white/50 transition-colors">
                    <div>
                      <p className="text-sm text-slate-800">
                        <span className="font-bold">{act.reviewer}</span>{' '}
                        {['APPROVE', 'APPROVED'].includes(act.action) ? <span className="text-emerald-600 font-semibold">approved</span> : 
                         ['REJECT', 'REJECTED'].includes(act.action) ? <span className="text-red-600 font-semibold">rejected</span> : 
                         <span className="text-orange-600 font-semibold">escalated</span>}{' '}
                        case <span className="font-mono text-xs text-slate-600 font-bold bg-white px-2 py-1 rounded border border-slate-200 ml-1 shadow-sm">{act.case_id?.split('_').pop()}</span>
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 font-mono font-medium">
                      {formatDateTime(act.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  )
}
