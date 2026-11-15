import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { describeError, getTrip, type Trip } from '../lib/firestore'

export interface TripState {
  trip: Trip | null
  loading: boolean
  notFound: boolean
  error: string | null
}

interface Stored {
  /** `${uid}/${tripId}` the result belongs to; `null` before the first read. */
  key: string | null
  trip: Trip | null
  notFound: boolean
  error: string | null
}

const INITIAL: Stored = { key: null, trip: null, notFound: false, error: null }

/**
 * One trip, read once when the page opens.
 *
 * A single read rather than a listener: nothing on the trip document changes
 * after creation, and `getDoc` serves the cached copy when offline.
 */
export function useTrip(uid: string | null, tripId: string | null): TripState {
  const [stored, setStored] = useState<Stored>(INITIAL)

  useEffect(() => {
    if (!uid || !tripId) return

    const key = `${uid}/${tripId}`
    let cancelled = false

    void getTrip(db, uid, tripId)
      .then((trip) => {
        if (cancelled) return
        setStored({ key, trip, notFound: trip === null, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStored({ key, trip: null, notFound: false, error: describeError(error) })
      })

    return () => {
      cancelled = true
    }
  }, [uid, tripId])

  if (!uid || !tripId) {
    return { trip: null, loading: false, notFound: false, error: null }
  }

  const loading = stored.key !== `${uid}/${tripId}`
  return {
    trip: loading ? null : stored.trip,
    loading,
    notFound: loading ? false : stored.notFound,
    error: loading ? null : stored.error,
  }
}
