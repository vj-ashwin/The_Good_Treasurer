import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { describeError, watchTrips, type Trip } from '../lib/firestore'

export interface TripsState {
  trips: Trip[]
  loading: boolean
  error: string | null
}

interface Stored {
  /** The uid the stored result belongs to; `null` before the first snapshot. */
  key: string | null
  trips: Trip[]
  error: string | null
}

const INITIAL: Stored = { key: null, trips: [], error: null }

/**
 * Live trip list for the sidebar, newest first.
 *
 * The listener keeps working offline from the persistent cache, so this hook
 * has no separate "offline mode": a queued create appears immediately and the
 * snapshot simply updates when it syncs.
 *
 * State is keyed by uid so a change of account cannot show the previous user's
 * trips for a frame: loading is derived while `stored.key` is behind.
 */
export function useTrips(uid: string | null): TripsState {
  const [stored, setStored] = useState<Stored>(INITIAL)

  useEffect(() => {
    if (!uid) return

    return watchTrips(
      db,
      uid,
      (trips) => setStored({ key: uid, trips, error: null }),
      (error) =>
        setStored((previous) => ({
          key: uid,
          trips: previous.key === uid ? previous.trips : [],
          error: describeError(error),
        })),
    )
  }, [uid])

  if (!uid) return { trips: [], loading: false, error: null }

  const loading = stored.key !== uid
  return {
    trips: loading ? [] : stored.trips,
    loading,
    error: loading ? null : stored.error,
  }
}
