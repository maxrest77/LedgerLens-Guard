import { createBrowserRouter } from 'react-router-dom'
import LandingStory from './pages/LandingStory'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Workspace from './pages/Workspace'
import ExceptionDetail from './pages/ExceptionDetail'
import AuditLog from './pages/AuditLog'
import AuthGuard from './components/layout/AuthGuard'
import AppShell from './components/layout/AppShell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingStory />
  },
  {
    path: '/login',
    element: <Login />
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/dashboard',
            element: <Dashboard />
          },
          {
            path: '/workspace',
            element: <Workspace />
          },
          {
            path: '/exceptions/:id',
            element: <ExceptionDetail />
          },
          {
            path: '/audit',
            element: <AuditLog />
          }
        ]
      }
    ]
  }
])
