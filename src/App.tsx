import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SignInPage from './pages/SignInPage'
import TripListPage from './pages/TripListPage'
import TripDetailPage from './pages/TripDetailPage'
import { useAuth } from './hooks/useAuth'
import { isFirebaseConfigured } from './lib/firebase'
import { ROUTES } from './routes'

/** Shown when the VITE_FIREBASE_* variables are missing from the environment. */
function ConfigurationNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Firebase is not configured</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          The app could not read its Firebase settings. Add the following variables to a{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.local</code> file in the
          project root and restart the dev server:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          {`VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=`}
        </pre>
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

/**
 * Blocks signed-out users from app pages and sends signed-in users straight to
 * the trip list. Remembers where the user was heading so sign-in returns them
 * to the same deep link.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthSplash />
  if (!user) return <Navigate to={ROUTES.SIGN_IN} replace state={{ from: location.pathname }} />
  return <>{children}</>
}

/** Already signed in? Skip the login screen and go to the trips. */
function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.HOME

  if (loading) return <AuthSplash />
  if (user) return <Navigate to={from} replace />
  return <>{children}</>
}

export default function App() {
  if (!isFirebaseConfigured) return <ConfigurationNotice />

  return (
    <Routes>
      <Route
        path={ROUTES.SIGN_IN}
        element={
          <RedirectIfSignedIn>
            <SignInPage />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path={ROUTES.HOME}
        element={
          <RequireAuth>
            <TripListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/trip/:tripId"
        element={
          <RequireAuth>
            <TripDetailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
    </Routes>
  )
}
