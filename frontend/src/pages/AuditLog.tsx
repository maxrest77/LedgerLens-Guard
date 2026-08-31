import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import api from '../lib/api'
import { formatDateTime } from '../lib/formatters'
import { ShieldCheck, ShieldAlert, Lock } from 'lucide-react'

export default function AuditLog() {
  const [blocks, setBlocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<any>(null)

  useEffect(() => {
    fetchChain()
  }, [])

  const fetchChain = async () => {
    try {
      const res = await api.get('/api/audit')
      setBlocks(res.data.blocks)
    } catch (err) {
      // handled
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

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/60 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Cryptographic Audit Chain</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Tamper-evident ledger of all reviewer actions.</p>
        </div>
        <Button 
          onClick={handleVerify} 
          disabled={verifying || loading}
          className={`shadow-sm font-semibold px-6 ${verificationResult?.valid ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
        >
          {verifying ? 'Recalculating Hashes...' : 'Verify Chain Integrity'}
        </Button>
      </div>

      {verificationResult && (
        <Card className={`border shadow-sm rounded-2xl overflow-hidden relative ${verificationResult.valid ? 'border-emerald-200/60 bg-emerald-50/50' : 'border-red-200/60 bg-red-50/50'}`}>
          <div className="absolute inset-0 bg-white/20 backdrop-blur-xl pointer-events-none" />
          <CardContent className="relative z-10 p-5 flex items-center gap-4">
            {verificationResult.valid ? (
              <>
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
                <div>
                  <h4 className="font-bold text-emerald-800">Chain Intact</h4>
                  <p className="text-sm text-emerald-700 font-medium mt-0.5">All hashes match. Cryptographic integrity verified across {blocks.length} blocks.</p>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert className="h-8 w-8 text-red-600" />
                <div>
                  <h4 className="font-bold text-red-800">Integrity Violation Detected</h4>
                  <p className="text-sm text-red-700 font-medium mt-0.5">Hash mismatch detected at Block Index #{verificationResult.tampered_at_index}.</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-200/50 rounded-2xl animate-pulse w-full"></div>
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <Card className="bg-white/40 backdrop-blur-xl shadow-sm border-slate-200/60 rounded-2xl">
          <CardContent className="p-16 text-center flex flex-col items-center justify-center">
            <Lock className="h-12 w-12 text-slate-300 mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-slate-900 mb-1">Chain is Empty</h3>
            <p className="text-slate-500 font-medium">No reviewer actions have been recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 pt-2">
          {blocks.map((block, i) => (
            <div key={block.index} className="flex flex-col">
              {/* Connector */}
              {i > 0 && (
                <div className="flex justify-center -my-2 relative z-0">
                  <div className="w-px h-8 bg-slate-300/80"></div>
                </div>
              )}

              <Card className="bg-white/40 backdrop-blur-xl shadow-sm border border-slate-200/60 relative overflow-hidden group rounded-2xl z-10 hover:shadow-md transition-all">
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-300/60 group-hover:bg-blue-500 transition-colors"></div>
                
                <div className="relative z-10">
                  <CardHeader className="pb-3 pt-5 px-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg text-slate-900 font-mono flex items-center gap-3">
                          <span className="text-slate-500">BLOCK</span> #{block.index}
                          <Badge variant="outline" className="text-[10px] shadow-none bg-white font-bold border-slate-200 text-slate-700 uppercase tracking-widest">{block.action}</Badge>
                        </CardTitle>
                        <CardDescription className="text-xs mt-2 font-mono text-slate-500 font-medium">
                          {formatDateTime(block.timestamp)}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">{block.reviewer}</p>
                        <p className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mt-1 font-semibold">Case ID: <span className="text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded ml-1 shadow-sm">{block.case_id?.split('_').pop()}</span></p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-6 pb-5">
                    <div className="bg-white/60 p-4 rounded-xl mb-4 border border-slate-200/60 shadow-sm">
                      <p className="text-sm text-slate-700 italic font-medium">"{block.reason}"</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 shadow-sm">
                      <div>
                        <span className="text-slate-400 block mb-1.5 uppercase tracking-widest text-[10px] font-bold">Previous Hash</span>
                        <span className="text-slate-600 font-medium" title={block.previous_hash}>
                          {block.previous_hash.match(/^0+$/) ? 'GENESIS_BLOCK_0000' : `${block.previous_hash.slice(0, 12)}...${block.previous_hash.slice(-12)}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1.5 uppercase tracking-widest text-[10px] font-bold">Block Hash</span>
                        <span className="text-slate-900 font-bold" title={block.block_hash}>
                          {`${block.block_hash.slice(0, 12)}...${block.block_hash.slice(-12)}`}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
