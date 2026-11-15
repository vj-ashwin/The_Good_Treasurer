import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'

/**
 * Google sign-in. Renders the login card when signed out; when already signed
 * in, redirects to wherever the user was heading (or home).
 */
export default function SignInPage() {
  const { user, loading, busy, error, signInWithGoogle } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.HOME

  if (loading) return <AuthSplash />
  if (user) return <Navigate to={from} replace />

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
          <div className="flex flex-col items-center text-center">
            <BrandMark className="h-14 w-14" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
              The Good Treasurer
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Split trip expenses fairly, settle up in seconds, and keep every rupee accounted
              for. Your trips stay private in your own account.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400">
            By continuing you agree to keep your ledgers tidy.
          </p>
        </div>
      </div>
    </main>
  )
}

function AuthSplash() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        Loading…
      </div>
    </main>
  )
}

function BrandMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="12" className="fill-brand-600" />
      <path
        d="M11 15.5h18M11 21h11M11 26.5h7"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="28" cy="25" r="4.5" className="fill-brand-300" />
    </svg>
  )
}

function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.4 5.4 0 0 1-2.4 3.58v2.77h3.86c2.26-2.08 3.56-5.15 3.56-8.59z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-2.99c-1.07.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.3a7.2 7.2 0 0 1 0-4.6V6.61H1.29a11.99 11.99 0 0 0 0 10.78l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.61l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  )
}
