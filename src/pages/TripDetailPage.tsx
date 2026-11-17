import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTrip } from '../hooks/useTrip'
import { usePeople } from '../hooks/usePeople'
import { useExpenses } from '../hooks/useExpenses'
import AppShell from '../components/AppShell'
import ErrorNotice from '../components/ErrorNotice'
import ExpensesPanel from '../components/ExpensesPanel'
import HistoryPanel from '../components/HistoryPanel'
import PeoplePanel from '../components/PeoplePanel'
import ReportPanel from '../components/ReportPanel'
import { CheckIcon, ChartIcon, ClockIcon, PencilIcon, ReceiptIcon, UsersIcon, CloseIcon } from '../components/icons'
import { db } from '../lib/firebase'
import {
  describeError,
  isUuid,
  renameTrip,
  requireName,
  TRIP_NAME_MAX,
} from '../lib/firestore'
import { formatTimestamp } from '../lib/format'
import { ROUTES } from '../routes'

const TABS = [
  { id: 'expenses', label: 'Expenses', Icon: ReceiptIcon },
  { id: 'people', label: 'People', Icon: UsersIcon },
  { id: 'report', label: 'Report', Icon: ChartIcon },
  { id: 'history', label: 'History', Icon: ClockIcon },
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
  const { trip, loading, notFound, error, refresh } = useTrip(uid, tripId)
  const { people, loading: peopleLoading } = usePeople(uid, tripId)
  // One subscription for the whole page: switching tabs must not unmount the
  // listener and show a skeleton again.
  const {
    expenses,
    loading: expensesLoading,
    error: expensesError,
  } = useExpenses(uid, tripId)
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
        <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">Trip</p>
        <TripName uid={uid} tripId={tripId} name={trip.name} onRenamed={refresh} />
        <p className="mt-2 text-sm text-slate-500">
          Created {formatTimestamp(trip.createdAt)} · INR
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Trip sections"
        className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-card p-1 shadow-sm sm:flex"
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
              className={`inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none sm:px-3 ${
                selected
                  ? 'bg-brand-50 text-brand-700 dark:text-brand-100'
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
        {tab === 'expenses' ? (
          <ExpensesPanel
            uid={uid}
            tripId={tripId}
            people={people}
            expenses={expenses}
            loading={expensesLoading}
            error={expensesError}
          />
        ) : null}
        {tab === 'people' ? <PeoplePanel uid={uid} tripId={tripId} /> : null}
        {tab === 'report' ? (
          <ReportPanel
            uid={uid}
            tripId={tripId}
            trip={trip}
            people={people}
            peopleLoading={peopleLoading}
            expenses={expenses}
            loading={expensesLoading}
            error={expensesError}
          />
        ) : null}
        {tab === 'history' ? (
          <HistoryPanel uid={uid} tripId={tripId} expenses={expenses} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * The trip name as a click-to-rename control, the way NotebookLM treats a
 * notebook title: the visible name itself is the affordance, with a pencil
 * that appears on hover and focus. Editing is inline — Enter saves, Escape
 * cancels — and a successful save refreshes the header.
 */
function TripName({
  uid,
  tripId,
  name,
  onRenamed,
}: {
  uid: string
  tripId: string
  name: string
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let tripName: string
    try {
      tripName = requireName(inputRef.current?.value ?? '', TRIP_NAME_MAX, 'Trip name')
    } catch (validationError) {
      setError(describeError(validationError))
      return
    }

    setBusy(true)
    try {
      await renameTrip(db, uid, tripId, tripName)
      setEditing(false)
      onRenamed()
    } catch (writeFailure) {
      setError(describeError(writeFailure))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setError(null)
          }}
          title="Rename trip"
          className="-mx-1 group inline-flex max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-slate-900 transition hover:bg-slate-100 focus:ring-2 focus:ring-brand-500 focus:outline-none"
        >
          <span className="break-words">{name}</span>
          <PencilIcon className="h-4 w-4 shrink-0 self-center text-slate-400 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          <span className="sr-only">Rename trip</span>
        </button>
      </h1>
    )
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          defaultValue={name}
          maxLength={TRIP_NAME_MAX}
          aria-label="Trip name"
          autoComplete="off"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) setEditing(false)
          }}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-base shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:max-w-md sm:text-lg"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-card px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
      {error ? <ErrorNotice message={error} className="mt-2" /> : null}
    </form>
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
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-card p-6 text-center shadow-sm sm:p-8">
      <p className="text-base font-semibold text-slate-900">Trip not found</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        This trip does not exist, or it belongs to another account.
      </p>
      <Link
        to={ROUTES.HOME}
        className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-card px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
      >
        Back to trips
      </Link>
    </div>
  )
}
