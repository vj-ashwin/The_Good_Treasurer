import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { describeError, watchExpenses, type Expense } from '../lib/firestore'

export interface ExpensesState {
  expenses: Expense[]
  loading: boolean
  error: string | null
}

interface Stored {
  /** `${uid}/${tripId}` the stored list belongs to; `null` before the first snapshot. */
  key: string | null
  expenses: Expense[]
  error: string | null
}

const INITIAL: Stored = { key: null, expenses: [], error: null }

/**
 * Live expenses for one trip, newest day first.
 *
 * The list includes soft-deleted expenses so history/restore (M6) can show
 * them. Totals and reports must filter to `deletedAt === null`.
 */
export function useExpenses(uid: string | null, tripId: string | null): ExpensesState {
  const [stored, setStored] = useState<Stored>(INITIAL)

  useEffect(() => {
    if (!uid || !tripId) return

    const key = `${uid}/${tripId}`
    return watchExpenses(
      db,
      uid,
      tripId,
      (expenses) => setStored({ key, expenses, error: null }),
      (error) =>
        setStored((previous) => ({
          key,
          expenses: previous.key === key ? previous.expenses : [],
          error: describeError(error),
        })),
    )
  }, [uid, tripId])

  if (!uid || !tripId) return { expenses: [], loading: false, error: null }

  const loading = stored.key !== `${uid}/${tripId}`
  return {
    expenses: loading ? [] : stored.expenses,
    loading,
    error: loading ? null : stored.error,
  }
}
