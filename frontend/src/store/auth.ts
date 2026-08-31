import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../lib/api'

export interface ReviewerProfile {
  email: string
}

interface AuthState {
  token: string | null
  reviewer: ReviewerProfile | null
  setToken: (token: string) => void
  setReviewer: (reviewer: ReviewerProfile) => void
  logout: () => void
  fetchProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      reviewer: null,
      setToken: (token) => set({ token }),
      setReviewer: (reviewer) => set({ reviewer }),
      logout: () => {
        set({ token: null, reviewer: null })
        localStorage.removeItem('auth-storage')
      },
      fetchProfile: async () => {
        const { token } = get()
        if (!token) return

        try {
          const res = await api.get('/auth/me')
          set({ reviewer: res.data })
        } catch (err) {
          get().logout()
        }
      }
    }),
    {
      name: 'auth-storage',
      // Only persist the token
      partialize: (state) => ({ token: state.token }),
    }
  )
)
