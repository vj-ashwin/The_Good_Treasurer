import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { describeError, watchPeople, type Person } from '../lib/firestore'

export interface PeopleState {
  people: Person[]
  loading: boolean
  error: string | null
}

interface Stored {
  /** `${uid}/${tripId}` the stored list belongs to; `null` before the first snapshot. */
  key: string | null
  people: Person[]
  error: string | null
}

const INITIAL: Stored = { key: null, people: [], error: null }

/** Live people list for one trip, oldest first. Works from cache when offline. */
export function usePeople(uid: string | null, tripId: string | null): PeopleState {
  const [stored, setStored] = useState<Stored>(INITIAL)

  useEffect(() => {
    if (!uid || !tripId) return

    const key = `${uid}/${tripId}`
    return watchPeople(
      db,
      uid,
      tripId,
      (people) => setStored({ key, people, error: null }),
      (error) =>
        setStored((previous) => ({
          key,
          people: previous.key === key ? previous.people : [],
          error: describeError(error),
        })),
    )
  }, [uid, tripId])

  if (!uid || !tripId) return { people: [], loading: false, error: null }

  const loading = stored.key !== `${uid}/${tripId}`
  return {
    people: loading ? [] : stored.people,
    loading,
    error: loading ? null : stored.error,
  }
}
