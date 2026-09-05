import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '../store/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
})

api.interceptors.request.use(
  (config) => {
    config.headers['X-CSRF-Protection'] = '1'
    
    // Attach Bearer token if available
    const token = localStorage.getItem('access_token')
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`
    }

    if (['post', 'put', 'patch'].includes(config.method?.toLowerCase() || '')) {
      config.headers['Idempotency-Key'] = crypto.randomUUID()
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isSilentAuth = url.includes('/auth/refresh') || url.includes('/auth/login') || url.includes('/auth/me') || url.includes('/vault/share') || url.includes('/vault/access')
    if (error.response?.status === 401) {
      if (!isSilentAuth) {
        useAuthStore.getState().logout()
        toast.error('Session expired. Please log in again.')
      }
    } else {
      const msg = error.response?.data?.detail ?? 'An unexpected error occurred.'
      if (!isSilentAuth) {
        toast.error(msg)
      }
    }
    return Promise.reject(error)
  }
)

export default api
