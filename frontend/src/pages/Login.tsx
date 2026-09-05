import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { toast } from 'sonner'
import api from '../lib/api'
import { ArrowLeft } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const isAdmin = String(username || '').toLowerCase().includes('admin')
    const fallbackRole = isAdmin ? 'ADMIN' : 'REVIEWER'

    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)

      const res = await api.post('/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      if (typeof res.data === 'string' && (res.data as string).includes('<!doctype html')) {
        throw new Error('Vercel static rewrite')
      }

      const accessToken = res.data?.access_token || `demo_${Date.now()}`
      const userRole = res.data?.role || fallbackRole
      const profile = {
        email: res.data?.email || username,
        role: userRole,
        portfolio_id: res.data?.portfolio_id || (userRole === 'ADMIN' ? 'ADMIN' : 'PORT_01')
      }

      localStorage.setItem('access_token', accessToken)
      localStorage.setItem('auth_reviewer', JSON.stringify(profile))
      useAuthStore.getState().setReviewer(profile, accessToken)

      toast.success('Login successful')

      if (userRole === 'ADMIN') {
        navigate('/command-center', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err: any) {
      if (err.response?.status === 401 && err.response?.data?.detail) {
        toast.error(err.response.data.detail)
        return
      }

      // Standalone Demo Mode fallback for static Vercel / offline preview
      const demoToken = `demo_jwt_${fallbackRole.toLowerCase()}_${Date.now()}`
      const profile = {
        email: username || (isAdmin ? 'admin@ledgerlens.dev' : 'reviewer@ledgerlens.dev'),
        role: fallbackRole,
        portfolio_id: isAdmin ? 'ADMIN' : 'PORT_01'
      }

      localStorage.setItem('access_token', demoToken)
      localStorage.setItem('auth_reviewer', JSON.stringify(profile))
      useAuthStore.getState().setReviewer(profile, demoToken)

      toast.success(`Signed in as ${fallbackRole === 'ADMIN' ? 'Admin / Controller' : 'Reviewer / Maker'} (Demo Mode)`)

      if (fallbackRole === 'ADMIN') {
        navigate('/command-center', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  const instantLogin = async (demoEmail: string, demoPass: string) => {
    setUsername(demoEmail)
    setPassword(demoPass)
    setLoading(true)

    const isAdmin = String(demoEmail || '').toLowerCase().includes('admin')
    const userRole = isAdmin ? 'ADMIN' : 'REVIEWER'

    try {
      const formData = new URLSearchParams()
      formData.append('username', demoEmail)
      formData.append('password', demoPass)

      const res = await api.post('/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      if (typeof res.data === 'string' && (res.data as string).includes('<!doctype html')) {
        throw new Error('Vercel static rewrite')
      }

      const accessToken = res.data?.access_token || `demo_${Date.now()}`
      const profile = {
        email: res.data?.email || demoEmail,
        role: res.data?.role || userRole,
        portfolio_id: res.data?.portfolio_id || (userRole === 'ADMIN' ? 'ADMIN' : 'PORT_01')
      }

      localStorage.setItem('access_token', accessToken)
      localStorage.setItem('auth_reviewer', JSON.stringify(profile))
      useAuthStore.getState().setReviewer(profile, accessToken)

      toast.success(`Signed in as ${userRole === 'ADMIN' ? 'Admin / Controller' : 'Reviewer / Maker'}`)

      if (userRole === 'ADMIN') {
        navigate('/command-center', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch {
      // Fallback for static Vercel deployment / offline demo
      const demoToken = `demo_jwt_${userRole.toLowerCase()}_${Date.now()}`
      const profile = {
        email: demoEmail,
        role: userRole,
        portfolio_id: userRole === 'ADMIN' ? 'ADMIN' : 'PORT_01'
      }

      localStorage.setItem('access_token', demoToken)
      localStorage.setItem('auth_reviewer', JSON.stringify(profile))
      useAuthStore.getState().setReviewer(profile, demoToken)

      toast.success(`Signed in as ${userRole === 'ADMIN' ? 'Admin / Controller' : 'Reviewer / Maker'} (Demo Mode)`)

      if (userRole === 'ADMIN') {
        navigate('/command-center', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative">
      <div className="absolute top-6 left-6 md:top-8 md:left-8">
        <Button variant="ghost" onClick={() => navigate('/')} className="gap-2 text-muted-foreground hover:text-foreground font-medium rounded-full px-4 bg-secondary/50 hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" /> Home
        </Button>
      </div>

      <div className="w-full max-w-[420px] p-4">
        <div className="flex flex-col items-center justify-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <span className="text-destructive font-mono">_</span>
            LEDGERLENS
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-2 font-medium">Guard Platform</p>
        </div>

        <Card className="bg-card shadow-lg border-subtle rounded-2xl overflow-hidden">
          <CardHeader className="text-center pt-8 pb-4">
            <CardTitle className="text-xl font-bold text-foreground">Welcome back</CardTitle>
            <CardDescription className="text-sm mt-1">Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Email</label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="bg-background border-subtle shadow-sm h-11 focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background border-subtle shadow-sm h-11 focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button type="submit" className="w-full h-11 bg-primary text-white hover:bg-primary/90 shadow-sm font-medium rounded-lg mt-2" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Quick Demo Credentials for Fintech Operations */}
        <div className="mt-6 text-center text-xs text-muted-foreground font-mono bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-center gap-1.5 mb-2.5">
            <span className="font-semibold text-slate-900 text-[11px] uppercase tracking-wider">Instant 1-Click Demo Access</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 font-bold">Judges</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => instantLogin('admin@ledgerlens.dev', 'demo_admin_2024')}
              disabled={loading}
              className="px-2.5 py-2 text-left rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 transition-all text-indigo-950 cursor-pointer shadow-xs active:scale-98"
            >
              <div className="font-bold text-[11px] flex items-center justify-between">
                Admin / Controller
                <span className="text-[9px] font-normal text-indigo-600">Click →</span>
              </div>
              <div className="text-[10px] text-indigo-600 truncate">admin@ledgerlens.dev</div>
            </button>
            <button
              type="button"
              onClick={() => instantLogin('reviewer@ledgerlens.dev', 'demo_reviewer_2024')}
              disabled={loading}
              className="px-2.5 py-2 text-left rounded-lg border border-sky-200 bg-sky-50/70 hover:bg-sky-100 transition-all text-sky-950 cursor-pointer shadow-xs active:scale-98"
            >
              <div className="font-bold text-[11px] flex items-center justify-between">
                Reviewer / Maker
                <span className="text-[9px] font-normal text-sky-600">Click →</span>
              </div>
              <div className="text-[10px] text-sky-600 truncate">reviewer@ledgerlens.dev</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
