import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { router } from './router'
import './index.css'

import { ErrorBoundary } from './components/common/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="bottom-right" richColors />
    </ErrorBoundary>
  </StrictMode>
)
