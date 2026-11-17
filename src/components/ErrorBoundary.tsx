import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  message: string | null
}

/**
 * Catches a render-time exception anywhere below it.
 *
 * Without this, one bad document or one failed parse unmounts the whole tree
 * and leaves the user staring at a blank page with no way back. The boundary
 * shows the message (never a stack, never env values) and offers a reload.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : 'Unknown error' }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Console only: this is the developer's signal, not the user's. No env
    // values, no tokens, no document contents are logged.
    console.error('Render failed', error, info.componentStack)
  }

  render(): ReactNode {
    const { message } = this.state
    if (message === null) return this.props.children

    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
        <div role="alert" className="w-full max-w-lg rounded-2xl border border-red-200 bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            The page could not be displayed. Your saved trips are unaffected.
          </p>
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs break-words text-slate-700">
            {message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            Reload the app
          </button>
        </div>
      </main>
    )
  }
}
