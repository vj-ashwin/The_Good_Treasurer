import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTrip } from '../hooks/useTrip'
import AppShell from '../components/AppShell'
import ErrorNotice from '../components/ErrorNotice'
import PeoplePanel from '../components/PeoplePanel'
import { ChartIcon, ReceiptIcon, UsersIcon } from '../components/icons'
import { formatTimestamp } from '../lib/format'
import { isUuid } from '../lib/firestore'
import { ROUTES } from '../routes'

const TABS = [
  { id: 'expenses', label: 'Expenses', Icon: ReceiptIcon },
  { id: 'people', label: 'People', Icon: UsersIcon },
  { id: 'report', label: 'Report', Icon: ChartIcon },
] as const

type TabId = (typeof TABS)[number]['id']

/** One trip: header, tabs, and the People section (CUJ 1). */
export default function TripDetailPage() {
  const { user, signOutUser } = useAuth()
  const { tripId = '' } = useParams<{ tripId: string }>()
  const validId = isUuid(tripId)

  if (!user) return null

  return (
    <AppShell
      user={user}
      onSignOut={signOutUser}
      selectedTripId={validId ? tripId : undefined}
    >
      {validId ? <TripView uid={user.uid} tripId={tripId} /> : <TripNotFound />}
    </AppShell>
  )
}

function TripView({ uid, tripId }: { uid: string; tripId: string }) {
  const { trip, loading, notFound, error } = useTrip(uid, tripId)
  const [tab, setTab] = useState<TabId>('expenses')

  if (loading) return <TripSkeleton />

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorNotice message={error} />
      </div>
    )
  }

  if (notFound || !trip) return <TripNotFound />

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Trip</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {trip.name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Created {formatTimestamp(trip.createdAt)} · INR
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Trip sections"
        className="mt-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        {TABS.map(({ id, label, Icon }) => {
          const selected = tab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={selected}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none ${
                selected
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="mt-5"
      >
        {tab === 'expenses' ? <ExpensesPlaceholder /> : null}
        {tab === 'people' ? <PeoplePanel uid={uid} tripId={tripId} /> : null}
        {tab === 'report' ? <ReportPlaceholder /> : null}
      </div>
    </div>
  )
}

function ExpensesPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <ReceiptIcon className="mx-auto h-6 w-6 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">No expenses yet</p>
      <p className="mt-1 text-sm text-slate-500">
        Expenses recorded for this trip will appear here with their split.
      </p>
    </div>
  )
}

function ReportPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <ChartIcon className="mx-auto h-6 w-6 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">No report yet</p>
      <p className="mt-1 text-sm text-slate-500">
        The settlement report will appear once this trip has expenses.
      </p>
    </div>
  )
}

function TripSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" aria-hidden="true">
      <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-48 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 h-11 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-5 h-40 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  )
}

function TripNotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-semibold text-slate-900">Trip not found</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        This trip does not exist, or it belongs to another account.
      </p>
      <Link
        to={ROUTES.HOME}
        className="mt-6 inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
      >
        Back to trips
      </Link>
    </div>
  )
}
