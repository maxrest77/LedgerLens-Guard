import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import api from '../lib/api'
import { Settings, Play, CheckCircle, Activity, RotateCcw } from 'lucide-react'
import { formatPaisa } from '../lib/formatters'
import { toast } from 'sonner'

export interface ToleranceRule {
  id: number
  parameter_name: string
  threshold_value: number
  status: string
  effective_from: string | null
  effective_to: string | null
  proposed_by: string
  approved_by: string | null
  reason: string | null
}

export interface SimulationResult {
  affected_cases: number
  exposure_resolved_paisa: number
  total_open_cases: number
}

const ORIGINAL_STANDARD_PAISA = "500" // ₹5.00 Statutory System Standard

export default function RuleManagement() {
  const [tolerances, setTolerances] = useState<ToleranceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  
  const [newThreshold, setNewThreshold] = useState<string>(ORIGINAL_STANDARD_PAISA)

  useEffect(() => {
    fetchTolerances()
  }, [])
  
  const fetchTolerances = async () => {
    try {
      const res = await api.get('/api/admin/tolerances')
      setTolerances(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  const handleSimulate = async () => {
    setSimulating(true)
    try {
      const res = await api.post('/api/admin/rules/simulate', {
        parameter_name: "AUTO_RESOLVE_THRESHOLD_PAISA",
        threshold_value: parseInt(newThreshold, 10),
        reason: "Simulate new threshold"
      })
      setSimulationResult(res.data.impact)
      toast.success("Simulation complete")
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Simulation failed")
    } finally {
      setSimulating(false)
    }
  }
  
  const handlePropose = async () => {
    try {
      await api.post('/api/admin/rules/propose', {
        parameter_name: "AUTO_RESOLVE_THRESHOLD_PAISA",
        threshold_value: parseInt(newThreshold, 10),
        reason: "Proposed new threshold from Admin UI"
      })
      toast.success("Proposal submitted successfully in DRAFT mode.")
      fetchTolerances()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Error proposing rule")
    }
  }

  // Resets proposal form input back to 500 paisa (₹5.00)
  const handleResetForm = () => {
    setNewThreshold(ORIGINAL_STANDARD_PAISA)
    setSimulationResult(null)
    toast.info("Threshold reset to original standard (500 paisa / ₹5.00)")
  }

  // Resets system tolerance rule in the database back to original standard
  const handleResetToStandard = async () => {
    setResetting(true)
    try {
      await api.post('/api/admin/rules/reset')
      setNewThreshold(ORIGINAL_STANDARD_PAISA)
      setSimulationResult(null)
      await fetchTolerances()
      toast.success("Tolerance rules reset to original standard (₹5.00 / 500 paisa)")
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to reset tolerance rule")
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return <div className="text-slate-500 font-mono text-sm">Loading Rules...</div>
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Rule Management</h1>
          <p className="text-sm text-slate-500 mt-1">Configure tolerances and evaluate impact.</p>
        </div>
        <Button 
          onClick={handleResetToStandard} 
          disabled={resetting} 
          variant="outline" 
          className="gap-2 border-slate-300 hover:bg-slate-100 text-slate-700 shadow-sm cursor-pointer shrink-0"
        >
          <RotateCcw className={`h-4 w-4 ${resetting ? 'animate-spin' : ''}`} />
          {resetting ? 'Resetting...' : 'Reset to Original Standard'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Configured Tolerances</CardTitle>
            <span className="text-xs font-mono text-slate-400">Standard: 500 paisa (₹5.00)</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tolerances.map((rule) => (
                <div key={rule.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-800 flex items-center gap-2">
                      <Settings className="h-4 w-4 text-slate-500" />
                      {rule.parameter_name}
                    </span>
                    <Badge variant={rule.status === 'ACTIVE' ? 'success' : rule.status === 'DRAFT' ? 'warning' : 'outline'}>
                      {rule.status}
                    </Badge>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 mt-2">
                    {formatPaisa(rule.threshold_value)}
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-2 border-t pt-2 border-slate-200">
                    {rule.status === 'ACTIVE' ? `Approved by: ${rule.approved_by || 'System'}` : `Proposed by: ${rule.proposed_by} (Pending Review)`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg">Propose New Tolerance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Threshold (Paisa)</label>
                <input 
                  type="number" 
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-500 font-mono"
                />
              </div>
              
              <div className="flex flex-wrap sm:flex-nowrap gap-3">
                <Button onClick={handleSimulate} disabled={simulating} variant="outline" className="flex-1 gap-2 cursor-pointer">
                  <Play className="h-4 w-4" />
                  {simulating ? 'Simulating...' : 'Run Impact Simulation'}
                </Button>
                <Button 
                  onClick={handleResetForm} 
                  variant="outline" 
                  className="gap-2 border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                  title="Reset threshold input back to original standard (500 paisa / ₹5.00)"
                >
                  <RotateCcw className="h-4 w-4 text-slate-500" />
                  Reset to Original Standard
                </Button>
              </div>
              
              {simulationResult && (
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2">
                  <h4 className="font-semibold text-indigo-900 flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Simulation Results
                  </h4>
                  <div className="text-sm text-indigo-800">
                    <p>Affected cases: <strong>{simulationResult.affected_cases}</strong> out of {simulationResult.total_open_cases} open cases.</p>
                    <p>Exposure that would be auto-resolved: <strong>{formatPaisa(simulationResult.exposure_resolved_paisa)}</strong>.</p>
                  </div>
                  
                  <Button onClick={handlePropose} className="w-full mt-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">
                    <CheckCircle className="h-4 w-4" /> Submit Proposal
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
