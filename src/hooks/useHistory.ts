import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { describeError, watchHistory, type HistoryEntry } from '../lib/firestore'

export interface HistoryState {
  entries: HistoryEntry[]
  loading: boolean
  error: string | null
}

interface Stored {
  /** `${uid}/${tripId}` the stored list belongs to; `null` before the first snapshot. */
  key: string | null
  entries: HistoryEntry[]
  error: string | null
}

const INITIAL: Stored = { key: null, entries: [], error: null }

/** Live changelog for one trip, newest first. Append-only, so there is no writer here. */
export function useHistory(uid: string | null, tripId: string | null): HistoryState {
  const [stored, setStored] = useState<Stored>(INITIAL)

  useEffect(() => {
    if (!uid || !tripId) return

    const key = `${uid}/${tripId}`
    return watchHistory(
      db,
      uid,
      tripId,
      (entries) => setStored({ key, entries, error: null }),
      (error) =>
        setStored((previous) => ({
          key,
          entries: previous.key === key ? previous.entries : [],
          error: describeError(error),
        })),
    )
  }, [uid, tripId])

  if (!uid || !tripId) return { entries: [], loading: false, error: null }

  const loading = stored.key !== `${uid}/${tripId}`
  return {
    entries: loading ? [] : stored.entries,
    loading,
    error: loading ? null : stored.error,
  }
}
