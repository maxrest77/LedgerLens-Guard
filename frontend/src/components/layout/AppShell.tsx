import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, LayoutDashboard, Database, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useEffect } from 'react'
import { Button } from '../ui/button'

export default function AppShell() {
  const { logout, fetchProfile, reviewer } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-deep flex flex-col shadow-xl z-10 text-white">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-destructive font-mono">_</span>
            LEDGERLENS
          </h1>
          <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Guard Platform</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
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
            to="/workspace"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Database className="h-4 w-4" />
            Reconciliation
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
          <Outlet />
        </div>
      </main>
    </div>
  )
}
