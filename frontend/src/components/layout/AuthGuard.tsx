import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

export default function AuthGuard() {
  const { token, isCheckingAuth, checkAuthStatus } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    checkAuthStatus()

    // BFCache Mitigation: Force re-validation if user uses the browser's back button
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        checkAuthStatus()
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [checkAuthStatus])

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!token) {
    // Explicitly replace history to prevent back button from trapping the user
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
