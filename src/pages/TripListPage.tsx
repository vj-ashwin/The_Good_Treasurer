import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/AppShell'
import { LuggageIcon, PlusIcon } from '../components/icons'

/** Trip list landing pane. The sidebar holds the actual list. */
export default function TripListPage() {
  const { user, signOutUser } = useAuth()

  if (!user) return null

  return (
    <AppShell user={user} onSignOut={signOutUser}>
      {(openCreateTrip) => (
        <div className="mx-auto max-w-3xl">
          <p className="mt-2 text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
            Trip ledger
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Pick a trip, or start a new one
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
            Every trip keeps its own people, expenses and settlement. The sidebar lists them
            newest first and keeps working from this device when you are offline.
          </p>

          <section className="mt-8 rounded-2xl border border-slate-200 bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <LuggageIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">Create a trip</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Name the trip and add everyone splitting the costs. The first person is the
                  organiser.
                </p>
                <button
                  type="button"
                  onClick={openCreateTrip}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
                >
                  <PlusIcon />
                  New trip
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}
