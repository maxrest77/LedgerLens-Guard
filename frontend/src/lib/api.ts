import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '../store/auth'

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000', // Update for prod if needed
})

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      toast.error('Session expired. Please log in again.')
    } else {
      const msg = error.response?.data?.detail ?? 'An unexpected error occurred.'
      toast.error(msg)
    }
    return Promise.reject(error)
  }
)

export default api
