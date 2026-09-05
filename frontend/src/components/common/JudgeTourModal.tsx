import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  X, Compass, ShieldCheck, CheckCircle2, 
  ExternalLink, Layers, ShieldAlert, 
  Sparkles, UserCheck, KeyRound, 
  ArrowRightLeft, Flame, Database, Bot
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import api from '../../lib/api'
import { toast } from 'sonner'
import { Button } from '../ui/button'

interface JudgeTourModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function JudgeTourModal({ isOpen, onClose }: JudgeTourModalProps) {
  const [activeTab, setActiveTab] = useState<'tour' | 'personas' | 'features' | 'tests'>('tour')
  const [switchingRole, setSwitchingRole] = useState(false)
  const { reviewer, setReviewer } = useAuthStore()
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleQuickLogin = async (email: string, pass: string, targetRoute?: string) => {
    setSwitchingRole(true)
    try {
      const formData = new URLSearchParams()
      formData.append('username', email)
      formData.append('password', pass)

      const res = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      const accessToken = res.data.access_token
      if (accessToken) {
        localStorage.setItem('access_token', accessToken)
      }

      const role = res.data.role || 'REVIEWER'
      setReviewer({
        email: res.data.email || email,
        role: role,
        portfolio_id: res.data.portfolio_id
      }, accessToken)

      toast.success(`Switched to ${role === 'ADMIN' ? 'Admin / Controller' : 'Reviewer / Maker'} persona!`)
      if (targetRoute) {
        navigate(targetRoute)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Quick persona switch failed')
    } finally {
      setSwitchingRole(false)
    }
  }

  const tourSteps = [
    {
      step: 1,
      title: 'Deterministic 4-Way Reconciliation',
      route: '/workspace',
      roleReq: 'Any',
      icon: Layers,
      highlight: 'Zero Floating-Point Precision',
      desc: 'Ingests multi-gateway streams (VelocePay, PrismPay, ISO 20022 CAMT.053) and matches against Bank UTR records using exact paisa integer math with 18% GST tax variance logic.',
      actionHint: 'Click an exception row to inspect match breakdown, fee drift, and root cause diagnosis.',
    },
    {
      step: 2,
      title: 'Maker-Checker Dual Custody Approval',
      route: '/approval-queue',
      roleReq: 'ADMIN',
      icon: ShieldAlert,
      highlight: 'RBI/SOX Four-Eyes Principle',
      desc: 'High-severity and Critical anomalies require dual-custody authorization. A Reviewer (Maker) proposes resolution with mandatory reason rationale, and an Admin (Checker) approves.',
      actionHint: 'Switch to Reviewer to propose a resolution in Case Preview (/my-desk), then switch to Admin to approve it.',
    },
    {
      step: 3,
      title: 'WORM Cryptographic Audit Chain & Bitcoin Anchoring',
      route: '/audit',
      roleReq: 'Any',
      icon: ShieldCheck,
      highlight: 'SHA-256 Merkle Chaining + OpenTimestamps',
      desc: 'Every state mutation writes an immutable WORM audit block sealed with prev_hash chaining and periodic Bitcoin OpenTimestamps (OTS) proofs to prevent tamper.',
      actionHint: 'Click "Verify Chain Integrity" to validate that zero blocks have been altered.',
    },
    {
      step: 4,
      title: 'Fintech Insights Treemap & Money Flow',
      route: '/insights',
      roleReq: 'Any',
      icon: Compass,
      highlight: 'Proportional Anomaly Distribution',
      desc: 'Visualizes exception codes (MDR drift, tax mismatches, settlement slippage) sized by case count or financial impact (₹ INR), alongside 90-day seasonal anomaly heatmaps.',
      actionHint: 'Toggle between "By Case Volume" and "By Financial Impact" to see dynamic proportional scaling.',
    },
    {
      step: 5,
      title: 'Regulatory Compliance & DPDP Vault Share',
      route: '/compliance',
      roleReq: 'ADMIN',
      icon: KeyRound,
      highlight: 'DPDP Act 2023 "Right to be Forgotten" & Public Token Share',
      desc: 'One-click cryptographic PII erasure that redacts personal data without corrupting ledger math, plus expiring read-only vault share tokens for external auditors.',
      actionHint: 'Generate an external audit vault token or trigger a Right to be Forgotten erasure.',
    },
    {
      step: 6,
      title: 'Autonomous AI Finance Controller Copilot',
      route: '/workspace',
      roleReq: 'Any',
      icon: Bot,
      highlight: 'Sovereign In-Engine Reasoning & Factual Validation Gate',
      desc: 'An in-engine AI reasoning agent with zero external data leakage and zero token limits. Performs instant forensic investigation, exposure audit, and dispute drafting verified against deterministic ledger math.',
      actionHint: 'Press Ctrl+K anywhere or click the "AI Copilot" badge in the sidebar to ask questions.',
    },
  ]

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Judge & Evaluator Guide</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-full font-semibold">
                  Interactive Demo Tour
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Everything you need to test and verify LedgerLens Guard in 5 minutes
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Persona Bar: Instant 1-Click Role Switcher */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <UserCheck className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-slate-800">Active Persona:</span>
            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-white border border-slate-200 text-slate-800">
              {reviewer?.role || 'GUEST'} ({reviewer?.email || 'Not logged in'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Quick Switch:</span>
            <button
              onClick={() => handleQuickLogin('admin@ledgerlens.dev', 'demo_admin_2024')}
              disabled={switchingRole || reviewer?.role === 'ADMIN'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                reviewer?.role === 'ADMIN'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Admin / Controller
            </button>

            <button
              onClick={() => handleQuickLogin('reviewer@ledgerlens.dev', 'demo_reviewer_2024')}
              disabled={switchingRole || reviewer?.role === 'REVIEWER'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                reviewer?.role === 'REVIEWER'
                  ? 'bg-sky-100 text-sky-800 border border-sky-300 shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-sky-600" />
              Reviewer / Maker
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white">
          <button
            onClick={() => setActiveTab('tour')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'tour'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            🧭 5-Minute Golden Path
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'features'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            ✨ Complete Feature Matrix
          </button>
          <button
            onClick={() => setActiveTab('personas')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'personas'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            👥 Test Personas & Permissions
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'tests'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            🧪 Automated Tests & CLI
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'tour' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-950 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Judge's Golden Path:</span> Follow these 5 consecutive stops to experience how the autonomous reconciliation pipeline ingests, audits, explains, resolves, and seals financial transactions across multi-gateway environments.
                </div>
              </div>

              <div className="space-y-3">
                {tourSteps.map((step) => {
                  const Icon = step.icon
                  return (
                    <div 
                      key={step.step}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-bold text-xs text-slate-700 shrink-0 mt-0.5">
                          0{step.step}
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{step.title}</span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {step.highlight}
                            </span>
                            {step.roleReq !== 'Any' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                                Req: {step.roleReq}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 pt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span><strong className="text-slate-700">What to test:</strong> {step.actionHint}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (step.roleReq === 'ADMIN' && reviewer?.role !== 'ADMIN') {
                              handleQuickLogin('admin@ledgerlens.dev', 'demo_admin_2024', step.route)
                            } else {
                              navigate(step.route)
                            }
                            onClose()
                          }}
                          className="gap-1.5 text-xs bg-slate-900 text-white hover:bg-slate-800"
                        >
                          <Icon className="w-3.5 h-3.5" />
                          Jump to {step.route}
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    4-Way Multi-Gateway Ingestion
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Normalizes heterogeneous feeds from Razorpay, PrismPay, ClearSettle, and ISO 20022 CAMT.053 bank statements into unified schema.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /workspace & /dashboard</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    Maker-Checker Dual Custody
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Prevents rogue approvals. Critical severity cases require Maker proposal with narrative and Checker confirmation.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /my-desk & /approval-queue</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    WORM Cryptographic Audit Chain
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    SHA-256 block hashing with previous block linkage, automated tamper detection, and Bitcoin OpenTimestamps proofs.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /audit</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Compass className="w-4 h-4 text-amber-600" />
                    Fintech Treemap & Anomaly Matrix
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Proportional exception sizing by count/amount, solid black high-contrast fintech surface, and 90-day seasonal anomaly calendar.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /insights</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                    Capital Liquidity & Money Flow
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Tracks captured gross volume through MDR interchange, 18% GST deduction, and net settlement credit at banks.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /money-flow</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Flame className="w-4 h-4 text-rose-500" />
                    Risk Center & Insider Tracking
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Monitors reviewer behavioral anomalies, velocity outliers, and uncharacteristic bulk approvals.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /risk-center</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Database className="w-4 h-4 text-purple-600" />
                    Dynamic Rule Simulation
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Simulate auto-resolution tolerance threshold impacts on historical batches prior to deploying rules into production.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /rule-management</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <KeyRound className="w-4 h-4 text-emerald-600" />
                    DPDP Compliance & Public Vault
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    DPDP Act 2023 "Right to be Forgotten" cryptographic erasure, plus time-limited external auditor vault tokens.
                  </p>
                  <div className="font-mono text-[10px] text-slate-500">Route: /compliance & /vault/access/:token</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'personas' && (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                LedgerLens Guard enforces Role-Based Access Control (RBAC) across all sensitive operations. Use the buttons below to instantly switch personas during your evaluation:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-emerald-950 text-sm">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Admin / Controller
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-semibold">
                      Role: ADMIN
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 space-y-1">
                    <div><strong>Email:</strong> <code className="bg-white px-1.5 py-0.5 rounded border text-slate-800">admin@ledgerlens.dev</code></div>
                    <div><strong>Password:</strong> <code className="bg-white px-1.5 py-0.5 rounded border text-slate-800">demo_admin_2024</code></div>
                    <div><strong>Capabilities:</strong> Final approval of Critical dual-custody cases, Rule tolerance proposals, DPDP compliance erasure, Vault share token generation, Gateway health oversight.</div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleQuickLogin('admin@ledgerlens.dev', 'demo_admin_2024')}
                    disabled={reviewer?.role === 'ADMIN'}
                    className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
                  >
                    {reviewer?.role === 'ADMIN' ? '✓ Currently Active' : 'Switch to Admin Persona'}
                  </Button>
                </div>

                <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sky-950 text-sm">
                      <UserCheck className="w-4 h-4 text-sky-600" />
                      Reviewer / Maker
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-100 text-sky-800 font-semibold">
                      Role: REVIEWER
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 space-y-1">
                    <div><strong>Email:</strong> <code className="bg-white px-1.5 py-0.5 rounded border text-slate-800">reviewer@ledgerlens.dev</code></div>
                    <div><strong>Password:</strong> <code className="bg-white px-1.5 py-0.5 rounded border text-slate-800">demo_reviewer_2024</code></div>
                    <div><strong>Capabilities:</strong> Portfolio exception triage, root cause analysis, proposing resolution on exceptions, operational dashboard access.</div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleQuickLogin('reviewer@ledgerlens.dev', 'demo_reviewer_2024')}
                    disabled={reviewer?.role === 'REVIEWER'}
                    className="w-full bg-sky-700 text-white hover:bg-sky-800"
                  >
                    {reviewer?.role === 'REVIEWER' ? '✓ Currently Active' : 'Switch to Reviewer Persona'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                You can run the full automated verification test suite directly from your terminal to confirm mathematical invariants, cryptographic hash chain integrity, concurrency safety, and RBAC:
              </p>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-900 text-slate-100 font-mono text-[11px] space-y-2">
                  <div className="text-slate-400 font-sans font-semibold text-xs flex items-center justify-between">
                    <span>1. Run Entire Backend Test Suite (Pytest)</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('uv run --directory backend pytest -v')
                        toast.success('Copied pytest command to clipboard')
                      }}
                      className="text-indigo-400 hover:text-indigo-300 text-[10px] font-sans"
                    >
                      Copy Command
                    </button>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400">
                    uv run --directory backend pytest -v
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans">
                    Runs 50+ unit and integration tests covering reconciliation upserts, concurrency locking, IDOR protection, webhook verification, and rate limiting.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-900 text-slate-100 font-mono text-[11px] space-y-2">
                  <div className="text-slate-400 font-sans font-semibold text-xs flex items-center justify-between">
                    <span>2. Verify Bitcoin OpenTimestamps Anchor</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('uv run --directory backend python -m backend.scripts.verify_anchor')
                        toast.success('Copied anchor verification command to clipboard')
                      }}
                      className="text-indigo-400 hover:text-indigo-300 text-[10px] font-sans"
                    >
                      Copy Command
                    </button>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400">
                    uv run --directory backend python -m backend.scripts.verify_anchor
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans">
                    Validates the cryptographic commitment against OTS Bitcoin blocks.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <div>
            Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px] text-slate-700">?</kbd> anywhere to re-open this guide.
          </div>
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs">
            Close Guide
          </Button>
        </div>
      </div>
    </div>
  )
}
