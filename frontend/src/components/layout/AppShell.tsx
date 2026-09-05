import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, LayoutDashboard, Database, ShieldAlert, Briefcase, Layers, BarChart3, Compass, Activity, ArrowRightLeft, Flame, ShieldCheck, Sparkles, Bot } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import JudgeTourModal from '../common/JudgeTourModal'
import AICopilotDrawer from '../common/AICopilotDrawer'
import { ErrorBoundary } from '../common/ErrorBoundary'

export default function AppShell() {
  const { logout, fetchProfile, reviewer } = useAuthStore()
  const [isTourOpen, setIsTourOpen] = useState(false)
  const [isCopilotOpen, setIsCopilotOpen] = useState(false)
  const [copilotCaseId, setCopilotCaseId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  useEffect(() => {
    const handleOpenCopilot = (e: Event) => {
      const customEvent = e as CustomEvent<{ caseId?: string }>
      setCopilotCaseId(customEvent.detail?.caseId || null)
      setIsCopilotOpen(true)
    }
    window.addEventListener('open-ai-copilot', handleOpenCopilot)
    return () => window.removeEventListener('open-ai-copilot', handleOpenCopilot)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or contentEditable
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key === '?' || (e.ctrlKey && e.key === 'j')) {
        e.preventDefault()
        setIsTourOpen((prev) => !prev)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCopilotOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-deep flex flex-col shadow-xl z-10 text-white">
        <div className="p-6 border-b border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <span className="text-destructive font-mono">_</span>
                LEDGERLENS
              </h1>
              <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Guard Platform</p>
            </div>
          </div>

          {/* AI Finance Controller Copilot Button */}
          <button
            type="button"
            onClick={() => setIsCopilotOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-600/25 to-teal-600/25 border border-emerald-400/40 text-emerald-200 hover:text-white hover:border-emerald-400/80 transition-all text-xs font-semibold shadow-xs group"
          >
            <span className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              AI Controller Copilot
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70">
              Ctrl+K
            </span>
          </button>

          {/* Prominent Judge's Guide Tour Button */}
          <button
            type="button"
            onClick={() => setIsTourOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600/25 to-purple-600/25 border border-indigo-400/40 text-indigo-200 hover:text-white hover:border-indigo-400/80 transition-all text-xs font-semibold shadow-xs group"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              Judge's Tour & Guide
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70">
              ?
            </span>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {reviewer?.role === 'ADMIN' ? (
            <>
              <NavLink
                to="/command-center"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <LayoutDashboard className="h-4 w-4" />
                Command Center
              </NavLink>
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink
                to="/gateway-health"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Activity className="h-4 w-4" />
                Gateway Health
              </NavLink>
              <NavLink
                to="/rule-management"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Database className="h-4 w-4" />
                Rules & Tolerances
              </NavLink>
              <NavLink
                to="/approval-queue"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <ShieldAlert className="h-4 w-4" />
                Approval Queue
              </NavLink>
            </>
          ) : (
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>
          )}
          
          <NavLink
            to="/my-desk"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Briefcase className="h-4 w-4" />
            My Desk
          </NavLink>

          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <BarChart3 className="h-4 w-4" />
            Internal Analytics
          </NavLink>

          <NavLink
            to="/insights"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Compass className="h-4 w-4" />
            Insights
          </NavLink>

          <NavLink
            to="/money-flow"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <ArrowRightLeft className="h-4 w-4" />
            Money flow
          </NavLink>

          <NavLink
            to="/risk-center"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Flame className="h-4 w-4 text-rose-400" />
            Risk center
          </NavLink>

          {(reviewer?.role === 'ADMIN' || reviewer?.role === 'AUDITOR') && (
            <NavLink
              to="/compliance"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Compliance
            </NavLink>
          )}

          <NavLink
            to="/workspace"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Layers className="h-4 w-4" />
            Exception Registry
          </NavLink>

          <NavLink
            to="/audit"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <ShieldAlert className="h-4 w-4" />
            Audit Chain
          </NavLink>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="mb-4">
            <p className="text-xs text-white/50 truncate font-mono">{reviewer?.email || 'Loading...'}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-white/60 hover:text-white hover:bg-white/5" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Global Judge & Evaluator Guide Modal */}
      <ErrorBoundary fallback={null}>
        <JudgeTourModal isOpen={isTourOpen} onClose={() => setIsTourOpen(false)} />
      </ErrorBoundary>

      {/* Sovereign AI Finance Controller Copilot Drawer */}
      <ErrorBoundary fallback={null}>
        <AICopilotDrawer 
          isOpen={isCopilotOpen} 
          onClose={() => {
            setIsCopilotOpen(false)
            setCopilotCaseId(null)
          }} 
          initialCaseId={copilotCaseId}
        />
      </ErrorBoundary>
    </div>
  )
}
