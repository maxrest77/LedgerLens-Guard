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
  const setToken = useAuthStore((state) => state.setToken)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)

      const res = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      setToken(res.data.access_token)
      toast.success('Login successful')
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Login failed')
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

      <div className="w-full max-w-[400px] p-4">
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

        {import.meta.env.VITE_DEMO_MODE === 'true' && (
          <div className="mt-8 text-center text-[11px] text-muted-foreground font-mono bg-secondary/50 p-4 rounded-xl border border-subtle">
            <p className="font-semibold text-foreground mb-1">DEMO CREDENTIALS</p>
            <p>Email: <span className="text-foreground">reviewer@ledgerlens.dev</span></p>
            <p>Password: <span className="text-foreground">demo_reviewer_2024</span></p>
          </div>
        )}
      </div>
    </div>
  )
}
