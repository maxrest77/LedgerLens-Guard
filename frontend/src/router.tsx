import React, { Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import AuthGuard from './components/layout/AuthGuard'
import AppShell from './components/layout/AppShell'
import { ErrorBoundary, RouteErrorBoundary } from './components/common/ErrorBoundary'
import { PageLoader } from './components/common/PageLoader'

// Lazy-loaded route components for high-performance code splitting
const LandingStory = React.lazy(() => import('./pages/LandingStory'))
const Login = React.lazy(() => import('./pages/Login'))
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const CommandCenter = React.lazy(() => import('./pages/CommandCenter'))
const GatewayHealth = React.lazy(() => import('./pages/GatewayHealth'))
const RuleManagement = React.lazy(() => import('./pages/RuleManagement'))
const ApprovalQueue = React.lazy(() => import('./pages/ApprovalQueue'))
const Workspace = React.lazy(() => import('./pages/Workspace'))
const ExceptionDetail = React.lazy(() => import('./pages/ExceptionDetail'))
const AuditLog = React.lazy(() => import('./pages/AuditLog'))
const PublicVaultAccess = React.lazy(() => import('./pages/PublicVaultAccess'))
const MyDesk = React.lazy(() => import('./pages/MyDesk'))
const InternalAnalytics = React.lazy(() => import('./pages/InternalAnalytics'))
const Insights = React.lazy(() => import('./pages/Insights'))
const MoneyFlow = React.lazy(() => import('./pages/MoneyFlow'))
const RiskCenter = React.lazy(() => import('./pages/RiskCenter'))
const ComplianceCenter = React.lazy(() => import('./pages/ComplianceCenter'))
const EngineeringJourney = React.lazy(() => import('./pages/EngineeringJourney'))

const withSuspenseAndBoundary = (Component: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}>
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  </Suspense>
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspenseAndBoundary(LandingStory),
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/journey',
    element: withSuspenseAndBoundary(EngineeringJourney),
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/story',
    element: withSuspenseAndBoundary(EngineeringJourney),
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/login',
    element: withSuspenseAndBoundary(Login),
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/vault/access/:token',
    element: withSuspenseAndBoundary(PublicVaultAccess),
    errorElement: <RouteErrorBoundary />
  },
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            path: '/dashboard',
            element: withSuspenseAndBoundary(Dashboard)
          },
          {
            path: '/command-center',
            element: withSuspenseAndBoundary(CommandCenter)
          },
          {
            path: '/gateway-health',
            element: withSuspenseAndBoundary(GatewayHealth)
          },
          {
            path: '/rule-management',
            element: withSuspenseAndBoundary(RuleManagement)
          },
          {
            path: '/approval-queue',
            element: withSuspenseAndBoundary(ApprovalQueue)
          },
          {
            path: '/approvals',
            element: withSuspenseAndBoundary(ApprovalQueue)
          },
          {
            path: '/my-desk',
            element: withSuspenseAndBoundary(MyDesk)
          },
          {
            path: '/analytics',
            element: withSuspenseAndBoundary(InternalAnalytics)
          },
          {
            path: '/insights',
            element: withSuspenseAndBoundary(Insights)
          },
          {
            path: '/money-flow',
            element: withSuspenseAndBoundary(MoneyFlow)
          },
          {
            path: '/risk-center',
            element: withSuspenseAndBoundary(RiskCenter)
          },
          {
            path: '/compliance',
            element: withSuspenseAndBoundary(ComplianceCenter)
          },
          {
            path: '/workspace',
            element: withSuspenseAndBoundary(Workspace)
          },
          {
            path: '/exceptions/:id',
            element: withSuspenseAndBoundary(ExceptionDetail)
          },
          {
            path: '/audit',
            element: withSuspenseAndBoundary(AuditLog)
          }
        ]
      }
    ]
  }
])
