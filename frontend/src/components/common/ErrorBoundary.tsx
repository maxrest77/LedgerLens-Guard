import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'

interface Props {
  children?: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LedgerLens ErrorBoundary caught error]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false })
  }

  private handleCopy = () => {
    const errorDetails = `Error: ${this.state.error?.message || 'Unknown error'}\n\nStack:\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`
    navigator.clipboard.writeText(errorDetails)
    this.setState({ copied: true })
    setTimeout(() => this.setState({ copied: false }), 2000)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[420px] w-full flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-slate-900/90 border border-rose-500/30 rounded-xl p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <div className="p-2.5 bg-rose-500/10 rounded-lg border border-rose-500/20">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Something went wrong</h3>
                <p className="text-xs text-slate-400">An unexpected view failure occurred in this component.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 font-mono text-xs text-rose-300 mb-4 break-words">
              {this.state.error?.message || 'An unexpected rendering error was encountered.'}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>

              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
              >
                Reload Page
              </button>

              <button
                onClick={this.handleCopy}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition"
                title="Copy technical stack trace"
              >
                {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {this.state.copied ? 'Copied' : 'Copy Trace'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  const [copied, setCopied] = React.useState(false)
  const [showStack, setShowStack] = React.useState(false)

  let title = 'Route Navigation Error'
  let message = 'An unexpected failure occurred while loading this view.'
  let statusText = ''

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`
    message = error.data?.message || 'The requested portal resource was not found or accessible.'
    statusText = `HTTP ${error.status}`
  } else if (error instanceof Error) {
    message = error.message
  }

  const handleCopy = () => {
    const trace = error instanceof Error ? error.stack : JSON.stringify(error, null, 2)
    navigator.clipboard.writeText(trace || message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-900/95 border border-slate-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-rose-400" />
        </div>

        {statusText && (
          <span className="inline-block px-2.5 py-0.5 mb-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-xs font-mono">
            {statusText}
          </span>
        )}

        <h2 className="text-xl font-bold text-slate-100 mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">{message}</p>

        <div className="flex items-center justify-center gap-3 mb-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition"
          >
            <Home className="w-4 h-4" />
            Return to Dashboard
          </Link>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
          >
            <RefreshCw className="w-4 h-4" />
            Reload App
          </button>
        </div>

        {error instanceof Error && error.stack && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-left">
            <button
              onClick={() => setShowStack(!showStack)}
              className="flex items-center justify-between w-full text-xs text-slate-500 hover:text-slate-300 py-1"
            >
              <span>Technical Diagnostics</span>
              {showStack ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showStack && (
              <div className="mt-2 relative">
                <pre className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                  {error.stack}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition"
                  title="Copy stack"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
