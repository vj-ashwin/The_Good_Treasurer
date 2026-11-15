import { BrandMark, GoogleIcon } from './icons'

interface LoginScreenProps {
  onSignIn: () => void
  error: string | null
  busy: boolean
}

export default function LoginScreen({ onSignIn, error, busy }: LoginScreenProps) {
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
              Track your personal spending with clarity and care. Your expenses stay private in
              your own account.
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
            onClick={onSignIn}
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
