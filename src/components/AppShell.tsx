import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { useTrips } from '../hooks/useTrips'
import { formatTimestamp } from '../lib/format'
import { ROUTES } from '../routes'
import CreateTripDialog from './CreateTripDialog'
import ErrorNotice from './ErrorNotice'
import { BrandMark, ChevronRightIcon, LogoutIcon, LuggageIcon, PlusIcon } from './icons'

interface AppShellProps {
  user: User
  onSignOut: () => void | Promise<void>
  /** Highlighted in the sidebar; omit on the trip list. */
  selectedTripId?: string
  /**
   * Page content. Pass a function to receive `openCreateTrip`, so the empty
   * state can offer the same action as the sidebar button.
   */
  children: ReactNode | ((openCreateTrip: () => void) => ReactNode)
}

/**
 * The signed-in frame: trip sidebar plus the page content.
 *
 * The sidebar is the trip list from PRD screen 2 — every trip, newest first,
 * permanently available. It owns the create-trip dialog so "New trip" works
 * from any page.
 */
export default function AppShell({
  user,
  onSignOut,
  selectedTripId,
  children,
}: AppShellProps) {
  const { trips, loading, error } = useTrips(user.uid)
  const [creating, setCreating] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <Link
            to={ROUTES.HOME}
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            <BrandMark className="h-9 w-9 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
              The Good Treasurer
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void onSignOut()}
            title="Sign out"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            <LogoutIcon />
            <span className="sr-only">Sign out</span>
          </button>
        </div>

        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            <PlusIcon />
            New trip
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 pb-2">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Trips</h2>
            {trips.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {trips.length}
              </span>
            ) : null}
          </div>

          <nav
            aria-label="Trips"
            className="max-h-[45vh] overflow-y-auto px-2 pb-3 lg:max-h-none lg:flex-1"
          >
            {loading && trips.length === 0 ? (
              <div className="space-y-2 px-2 py-1" aria-hidden="true">
                <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : null}

            {!loading && trips.length === 0 ? (
              <p className="px-3 py-3 text-sm leading-relaxed text-slate-500">
                No trips yet. Create one to start recording expenses.
              </p>
            ) : null}

            {trips.length > 0 ? (
              <ul className="space-y-1">
                {trips.map((trip) => {
                  const selected = trip.id === selectedTripId
                  return (
                    <li key={trip.id}>
                      <Link
                        to={ROUTES.TRIP(trip.id)}
                        aria-current={selected ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 transition focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none ${
                          selected
                            ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <LuggageIcon
                          className={`h-4 w-4 shrink-0 ${selected ? 'text-brand-600' : 'text-slate-400'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{trip.name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {formatTimestamp(trip.createdAt)}
                          </span>
                        </span>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </nav>

          {error ? <ErrorNotice message={error} className="mx-3 mb-3" /> : null}
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-800">
            {user.displayName || 'Treasurer'}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {typeof children === 'function' ? children(() => setCreating(true)) : children}
      </main>

      {creating ? (
        <CreateTripDialog uid={user.uid} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  )
}
