import { useState } from 'react'
import { useHistory } from '../hooks/useHistory'
import { db } from '../lib/firebase'
import {
  describeError,
  restoreExpense,
  updateExpense,
  type Expense,
  type HistoryAction,
  type HistoryEntry,
} from '../lib/firestore'
import { applyBeforeSnapshot, expenseToInput } from '../lib/expenseInput'
import { formatTimestamp } from '../lib/format'
import ErrorNotice from './ErrorNotice'
import { ClockIcon } from './icons'

const ACTION_LABEL: Record<HistoryAction, string> = {
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
  restore: 'Restored',
}

const ACTION_TONE: Record<HistoryAction, string> = {
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-slate-100 text-slate-700',
  delete: 'bg-amber-100 text-amber-800',
  restore: 'bg-brand-50 text-brand-700 dark:text-brand-100',
}

/** The title recorded with the entry, so a vanished expense still has a name. */
function snapshotTitle(entry: HistoryEntry): string | null {
  for (const snapshot of [entry.after, entry.before]) {
    const title = snapshot?.title
    if (typeof title === 'string' && title.length > 0) return title
  }
  return null
}

function describeChange(entry: HistoryEntry): string {
  if (entry.action === 'create') return 'Recorded the expense and its split.'
  if (entry.action === 'delete') return 'Removed the expense from totals. It can be restored.'
  if (entry.action === 'restore') return 'Brought the expense back into totals.'
  if (entry.changedFields.length === 0) return 'Changed the expense.'
  return `Changed ${entry.changedFields.join(', ')}.`
}

/**
 * The trip's changelog, newest first.
 *
 * History is append-only, so this panel never edits an entry. It offers two
 * safe actions: restoring an expense whose latest transition is a delete, and
 * undoing the latest edit by writing the entry's `before` snapshot back as a
 * new edit (which records its own history entry).
 */
export default function HistoryPanel({
  uid,
  tripId,
  expenses,
}: {
  uid: string
  tripId: string
  /** The trip page owns the single expense subscription and passes it down. */
  expenses: Expense[]
}) {
  const { entries, loading, error } = useHistory(uid, tripId)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const byId = new Map<string, Expense>(expenses.map((expense) => [expense.id, expense]))
  // Entries arrive newest first, so the first entry seen for an expense is its
  // latest transition. Only that one may offer Restore or Undo.
  const latestByExpense = new Map<string, string>()
  for (const entry of entries) {
    if (!latestByExpense.has(entry.expenseId)) {
      latestByExpense.set(entry.expenseId, entry.id)
    }
  }

  async function handleRestore(entry: HistoryEntry) {
    setPendingId(entry.id)
    setActionError(null)
    try {
      await restoreExpense(db, uid, tripId, entry.expenseId)
    } catch (failure) {
      setActionError(describeError(failure))
    } finally {
      setPendingId(null)
    }
  }

  async function handleUndo(entry: HistoryEntry) {
    const expense = byId.get(entry.expenseId)
    if (!expense) return
    setPendingId(entry.id)
    setActionError(null)
    try {
      // Re-apply the fields the edit changed. Re-saving through the normal
      // update path records the undo in history, so the changelog stays append-only.
      const restored = applyBeforeSnapshot(expense, entry.before)
      await updateExpense(db, uid, tripId, expense.id, expenseToInput(restored))
    } catch (failure) {
      setActionError(describeError(failure))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">History</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Every change recorded for this trip, newest first. Entries cannot be edited or removed.
        </p>
      </section>

      {error ? <ErrorNotice message={error} /> : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : null}

      {!loading && entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-card px-6 py-12 text-center">
          <ClockIcon className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">Nothing recorded yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Adding, editing, deleting or restoring an expense writes an entry here.
          </p>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
          {entries.map((entry) => {
            const expense = byId.get(entry.expenseId)
            const title = expense?.title ?? snapshotTitle(entry) ?? 'Removed expense'
            const isLatest = latestByExpense.get(entry.expenseId) === entry.id
            const canRestore =
              entry.action === 'delete' &&
              isLatest &&
              expense !== undefined &&
              expense.deletedAt !== null
            const canUndo =
              entry.action === 'update' &&
              isLatest &&
              expense !== undefined &&
              expense.deletedAt === null &&
              entry.before !== null
            const busy = pendingId === entry.id

            return (
              <li key={entry.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${ACTION_TONE[entry.action]}`}
                      >
                        {ACTION_LABEL[entry.action]}
                      </span>
                      <p className="break-words text-sm font-semibold text-slate-900">{title}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTimestamp(entry.timestamp)} · {describeChange(entry)}
                    </p>
                  </div>
                  {canRestore ? (
                    <button
                      type="button"
                      onClick={() => void handleRestore(entry)}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-card px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? 'Restoring…' : 'Restore'}
                    </button>
                  ) : null}
                  {canUndo ? (
                    <button
                      type="button"
                      onClick={() => void handleUndo(entry)}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-card px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? 'Undoing…' : 'Undo edit'}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
