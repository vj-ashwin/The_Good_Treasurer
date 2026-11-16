import { useState, type FormEvent } from 'react'
import { usePeople } from '../hooks/usePeople'
import { db } from '../lib/firebase'
import {
  addPerson,
  deletePerson,
  describeError,
  requireName,
  PERSON_NAME_MAX,
} from '../lib/firestore'
import ErrorNotice from './ErrorNotice'
import { PlusIcon, UsersIcon } from './icons'

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return letters || '?'
}

/**
 * People section for one trip (PRD screen 9, CUJ 1).
 *
 * Removal is guarded: `deletePerson` refuses while any expense still names the
 * person, live or soft-deleted (PRD OQ8), so a stored share can never become
 * unresolvable. The refusal message is shown inline.
 */
export default function PeoplePanel({ uid, tripId }: { uid: string; tripId: string }) {
  const { people, loading, error } = usePeople(uid, tripId)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function handleRemove(personId: string) {
    setPendingId(personId)
    setRemoveError(null)
    try {
      await deletePerson(db, uid, tripId, personId)
    } catch (removeFailure) {
      setRemoveError(describeError(removeFailure))
    } finally {
      setPendingId(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    let personName: string
    try {
      personName = requireName(name, PERSON_NAME_MAX, 'Person name')
    } catch (validationError) {
      setFormError(describeError(validationError))
      return
    }

    setBusy(true)
    try {
      await addPerson(db, uid, tripId, {
        name: personName,
        // TC-PM-02: the first person added to a trip is the organiser.
        isOrganizer: people.length === 0,
      })
      setName('')
    } catch (writeError) {
      setFormError(describeError(writeError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">People</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {people.length}
          </span>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={PERSON_NAME_MAX}
            placeholder="Add a person"
            aria-label="Person name"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
          <button
            type="submit"
            // While the first snapshot is in flight the list looks empty, so
            // adding here would wrongly mark the new person as organiser.
            disabled={busy || loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add
          </button>
        </form>

        {people.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            The first person you add is the organiser.
          </p>
        ) : null}

        {formError ? <ErrorNotice message={formError} className="mt-3" /> : null}
      </section>

      {error ? <ErrorNotice message={error} /> : null}
      {removeError ? <ErrorNotice message={removeError} /> : null}

      {loading && people.length === 0 ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : null}

      {!loading && people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <UsersIcon className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">No people yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add everyone who shares costs on this trip.
          </p>
        </div>
      ) : null}

      {people.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                {initials(person.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {person.name}
              </span>
              {person.isOrganizer ? (
                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  Organiser
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleRemove(person.id)}
                disabled={pendingId === person.id}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingId === person.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
