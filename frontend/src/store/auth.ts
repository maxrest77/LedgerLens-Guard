import { create } from 'zustand'
import api from '../lib/api'

export interface ReviewerProfile {
  email: string
  role: string
}

interface AuthState {
  token: string | null
  reviewer: ReviewerProfile | null
  setToken: (token: string) => void
  setReviewer: (reviewer: ReviewerProfile) => void
  logout: () => void
  fetchProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  reviewer: null,
  setToken: (token) => set({ token }),
  setReviewer: (reviewer) => set({ reviewer }),
  logout: () => {
    set({ token: null, reviewer: null })
  },
  fetchProfile: async () => {
    try {
      // It will use the cookie or token if available
      const res = await api.get('/auth/me')
      set({ reviewer: res.data })
    } catch (err) {
      get().logout()
    }
  }
}))
