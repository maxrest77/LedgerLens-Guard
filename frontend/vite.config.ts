import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/audit': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/copilot': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react'
            }
            if (id.includes('recharts')) {
              return 'vendor-recharts'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide'
            }
            if (id.includes('zustand') || id.includes('axios')) {
              return 'vendor-core'
            }
          }
        }
      }
    }
  }
})

