import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/firebase'
import {
  createTripWithPeople,
  describeError,
  requireName,
  PERSON_NAME_MAX,
  TRIP_NAME_MAX,
  ValidationError,
} from '../lib/firestore'
import { ROUTES } from '../routes'
import ErrorNotice from './ErrorNotice'
import { CloseIcon, PlusIcon } from './icons'

const MAX_PEOPLE = 50

/**
 * Create-trip dialog (CUJ 1).
 *
 * The trip and everyone typed here are written in one batch, so a bad person
 * name can never leave a trip created without its people. The first person is
 * the organiser.
 */
export default function CreateTripDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [people, setPeople] = useState<string[]>([''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    nameRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function updatePerson(index: number, value: string) {
    setPeople((previous) => previous.map((person, at) => (at === index ? value : person)))
  }

  function addPerson() {
    setPeople((previous) => (previous.length >= MAX_PEOPLE ? previous : [...previous, '']))
  }

  function removePerson(index: number) {
    setPeople((previous) => previous.filter((_, at) => at !== index))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let tripName: string
    let personNames: string[]
    try {
      tripName = requireName(name, TRIP_NAME_MAX, 'Trip name')
      const filled = people.map((person) => person.trim()).filter((person) => person.length > 0)
      if (filled.length === 0) {
        throw new ValidationError('Add at least one person, starting with yourself.')
      }
      personNames = filled.map((person, index) =>
        requireName(person, PERSON_NAME_MAX, `Person ${String(index + 1)} name`),
      )
    } catch (validationError) {
      setError(describeError(validationError))
      return
    }

    setBusy(true)
    try {
      const { id } = await createTripWithPeople(db, uid, { name: tripName, people: personNames })
      onClose()
      navigate(ROUTES.TRIP(id))
    } catch (writeError) {
      setError(describeError(writeError))
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      // `close` is deliberately not handled: the effect's cleanup calls
      // `dialog.close()`, and under StrictMode that cleanup runs right after the
      // mount effect, so an onClose here would unmount the dialog immediately.
      // Escape arrives as `cancel` instead, which still reaches the parent.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-labelledby="create-trip-title"
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col rounded-2xl border border-slate-200 bg-card p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="create-trip-title" className="text-lg font-semibold tracking-tight">
              New trip
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Name the trip and add everyone who is splitting costs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <CloseIcon />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {error ? <ErrorNotice message={error} /> : null}

          <div>
            <label htmlFor="trip-name" className="block text-sm font-medium text-slate-700">
              Trip name
            </label>
            <input
              ref={nameRef}
              id="trip-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={TRIP_NAME_MAX}
              placeholder="Goa 2026"
              autoComplete="off"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-base shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:text-sm"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">People</legend>
            <p className="mt-0.5 text-xs text-slate-500">
              The first person is the organiser. Leave a row blank to skip it.
            </p>

            <div className="mt-2 space-y-2">
              {people.map((person, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={person}
                    onChange={(event) => updatePerson(index, event.target.value)}
                    maxLength={PERSON_NAME_MAX}
                    placeholder={index === 0 ? 'Your name' : 'Name'}
                    aria-label={`Person ${String(index + 1)} name`}
                    autoComplete="off"
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-base shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:text-sm"
                  />
                  {index === 0 ? (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 dark:text-brand-100">
                      Organiser
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removePerson(index)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPerson}
              disabled={people.length >= MAX_PEOPLE}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-300"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add person
            </button>
          </fieldset>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-card px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy ? 'Creating…' : 'Create trip'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
