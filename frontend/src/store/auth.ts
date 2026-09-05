import { create } from 'zustand'
import api from '../lib/api'

export interface ReviewerProfile {
  email: string
  role: string
  portfolio_id?: string
}

interface AuthState {
  token: string | null
  reviewer: ReviewerProfile | null
  isCheckingAuth: boolean
  setReviewer: (reviewer: ReviewerProfile, token?: string | null) => void
  logout: () => Promise<void>
  fetchProfile: () => Promise<void>
  checkAuthStatus: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('access_token') || null,
  reviewer: null,
  isCheckingAuth: true,
  setReviewer: (reviewer, token) => {
    if (token) {
      localStorage.setItem('access_token', token)
    }
    set({ 
      reviewer, 
      token: token || localStorage.getItem('access_token') || 'active_session', 
      isCheckingAuth: false 
    })
  },
  logout: async () => {
    try {
      // Explicitly hit backend to destroy HttpOnly cookies and revoke refresh token
      await api.post('/auth/logout')
    } catch (err) {
      console.warn('Logout API failed, continuing local cleanup', err)
    } finally {
      localStorage.removeItem('access_token')
      sessionStorage.clear()
      set({ token: null, reviewer: null, isCheckingAuth: false })
    }
  },
  fetchProfile: async () => {
    try {
      const res = await api.get('/auth/me')
      set({ 
        reviewer: res.data, 
        token: localStorage.getItem('access_token') || 'active_session', 
        isCheckingAuth: false 
      })
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem('access_token')
        set({ reviewer: null, token: null, isCheckingAuth: false })
      }
    }
  },
  checkAuthStatus: async () => {
    set({ isCheckingAuth: true })
    try {
      const res = await api.get('/auth/me')
      set({ 
        reviewer: res.data, 
        token: localStorage.getItem('access_token') || 'active_session', 
        isCheckingAuth: false 
      })
    } catch {
      try {
        const refreshRes = await api.post('/auth/refresh')
        if (refreshRes.data?.access_token) {
          localStorage.setItem('access_token', refreshRes.data.access_token)
        }
        const meRes = await api.get('/auth/me')
        set({ 
          reviewer: meRes.data, 
          token: localStorage.getItem('access_token') || 'active_session', 
          isCheckingAuth: false 
        })
      } catch {
        localStorage.removeItem('access_token')
        set({ reviewer: null, token: null, isCheckingAuth: false })
      }
    }
  }
}))
