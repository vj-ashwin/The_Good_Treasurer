import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SignInPage from './pages/SignInPage'
import TripListPage from './pages/TripListPage'
import TripDetailPage from './pages/TripDetailPage'
import ConfigurationNotice from './components/ConfigurationNotice'
import { useAuth } from './hooks/useAuth'
import { isFirebaseConfigured } from './lib/firebase'
import { ROUTES } from './routes'

function AuthSplash() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50">
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
