import { useAuth } from '../hooks/useAuth'
import { BrandMark, LogoutIcon } from '../components/icons'

/**
 * Trip list + sidebar. Milestone 4 fills in the trip list, create-trip flow,
 * and open-trip navigation. For now this page proves the signed-in shell:
 * persistent session, user identity, and sign-out.
 */
export default function TripListPage() {
  const { user, signOutUser } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <div>
              <p className="text-base font-semibold tracking-tight text-slate-900">
                The Good Treasurer
              </p>
              <p className="text-xs text-slate-500">Trip expense ledger</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">
                {user?.displayName || user?.email || 'Treasurer'}
              </p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={signOutUser}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">No trips yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Trip list and create-trip arrive in Milestone 4.
          </p>
        </div>
      </main>
    </div>
  )
}
