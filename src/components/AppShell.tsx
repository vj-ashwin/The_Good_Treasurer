import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { useTrips } from '../hooks/useTrips'
import { useTheme } from '../hooks/useTheme'
import { formatTimestamp } from '../lib/format'
import { ROUTES } from '../routes'
import CreateTripDialog from './CreateTripDialog'
import ErrorNotice from './ErrorNotice'
import {
  BrandMark,
  ChevronRightIcon,
  CloseIcon,
  LogoutIcon,
  LuggageIcon,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from './icons'

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

/** Small icon button that flips the colour theme. Used on the mobile top bar. */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus:ring-2 focus:ring-brand-500 focus:outline-none"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      <span className="sr-only">{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</span>
    </button>
  )
}

/**
 * The signed-in frame: trip navigation plus the page content.
 *
 * On desktop (lg+) this is the trip sidebar from PRD screen 2. On phones the
 * sidebar becomes a sticky top bar plus a slide-out drawer, so the trip the
 * user opened is visible immediately instead of a stacked navigation.
 */
export default function AppShell({
  user,
  onSignOut,
  selectedTripId,
  children,
}: AppShellProps) {
  const { trips, loading, error } = useTrips(user.uid)
  const [creating, setCreating] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const firstDrawerControlRef = useRef<HTMLButtonElement>(null)

  // Escape closes the drawer; opening moves focus in, closing returns it to
  // the hamburger so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (!drawerOpen) return
    const hamburger = hamburgerRef.current
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    firstDrawerControlRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      hamburger?.focus()
    }
  }, [drawerOpen])

  // The drawer overlays the page: stop the page behind it from scrolling.
  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [drawerOpen])

  const tripList = (
    <nav aria-label="Trips" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
                  onClick={() => setDrawerOpen(false)}
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
  )

  return (
    <div className="min-h-dvh bg-slate-50 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/*
        Mobile top bar. Desktop sees the sidebar below instead, so this and the
        drawer are lg:hidden while the sidebar is hidden until lg.
      */}
      <header className="sticky top-0 z-30 flex items-center gap-1.5 border-b border-slate-200 bg-card px-2 py-1.5 lg:hidden">
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="app-drawer"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          <MenuIcon />
          <span className="sr-only">Open menu</span>
        </button>
        <Link
          to={ROUTES.HOME}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          <BrandMark className="h-8 w-8 shrink-0" />
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
            The Good Treasurer
          </span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Drawer backdrop */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Drawer */}
      <div
        id="app-drawer"
        // `inert` keeps the closed drawer out of the tab order entirely.
        inert={!drawerOpen}
        aria-hidden={!drawerOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col bg-card shadow-xl transition-transform duration-200 ease-out lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          <Link
            to={ROUTES.HOME}
            onClick={() => setDrawerOpen(false)}
            className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <BrandMark className="h-9 w-9 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
              The Good Treasurer
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <CloseIcon />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <div className="px-4 py-4">
          <button
            ref={firstDrawerControlRef}
            type="button"
            onClick={() => {
              setDrawerOpen(false)
              setCreating(true)
            }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            <PlusIcon />
            New trip
          </button>
        </div>

        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Trips</h2>
          {trips.length > 0 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {trips.length}
            </span>
          ) : null}
        </div>

        {tripList}

        {error ? <ErrorNotice message={error} className="mx-3 mb-3" /> : null}

        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-800">
            {user.displayName || 'Treasurer'}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            <LogoutIcon />
            Sign out
          </button>
        </div>
      </div>

      {/*
        Desktop sidebar: unchanged layout, hidden on phones where the drawer
        replaces it.
      */}
      <aside className="hidden flex-col border-r border-slate-200 bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh">
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

          {tripList}

          {error ? <ErrorNotice message={error} className="mx-3 mb-3" /> : null}
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-800">
            {user.displayName || 'Treasurer'}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      </aside>

      <main className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-10">
        {typeof children === 'function' ? children(() => setCreating(true)) : children}
      </main>

      {creating ? (
        <CreateTripDialog uid={user.uid} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  )
}
