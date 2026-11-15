/**
 * Trip reads and writes.
 *
 * Every function takes the `Firestore` instance explicitly instead of importing
 * the module-scope one, so the same code path can be exercised against the
 * emulator in `tests/firestore.service.rules.test.ts` and the app can pass the
 * persistent-cache instance from `src/lib/firebase.ts`.
 *
 * Writes always send the full field set the rules expect, with
 * `serverTimestamp()` for both date fields. Nothing is back-dated by the client.
 */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { newId } from './ids'
import { parseTrip, requireName, TRIP_NAME_MAX, type Trip } from './models'
import { tripPath, tripsPath } from './paths'

/** What a successful create returns. The full document arrives via the listener. */
export interface CreatedTrip {
  id: string
}

/**
 * Creates a trip and returns its client-generated id.
 *
 * The id is minted before the write, so a retry targets the same document and
 * can never create a second trip. The rules pin `createdAt` to the first
 * write, so a retried create that sends a new server timestamp is rejected as
 * an update rather than silently applied. `tests/firestore.service.rules.test.ts`
 * pins that behaviour; the offline-retry UX is a separate decision.
 */
export async function createTrip(
  db: Firestore,
  uid: string,
  nameInput: string,
): Promise<CreatedTrip> {
  const name = requireName(nameInput, TRIP_NAME_MAX, 'Trip name')
  const id = newId()
  await setDoc(doc(db, tripsPath(uid), id), {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { id }
}

/** Reads one trip, or `null` when it does not exist (or is not visible). */
export async function getTrip(
  db: Firestore,
  uid: string,
  tripId: string,
): Promise<Trip | null> {
  const snapshot = await getDoc(doc(db, tripPath(uid, tripId)))
  if (!snapshot.exists()) return null
  return parseTrip(snapshot.id, snapshot.data({ serverTimestamps: 'estimate' }))
}

/**
 * Subscribes to the trip list, newest first.
 *
 * A listener rather than a one-shot read: with persistent cache enabled it
 * serves the cached list when offline and updates it as soon as a queued write
 * is acknowledged, which is exactly the sidebar behaviour the PRD asks for.
 * `serverTimestamps: 'estimate'` keeps an unsynced trip visible and correctly
 * ordered instead of returning a null timestamp.
 */
export function watchTrips(
  db: Firestore,
  uid: string,
  onTrips: (trips: Trip[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const trips = collection(db, tripsPath(uid))
  return onSnapshot(
    query(trips, orderBy('createdAt', 'desc')),
    {
      next: (snapshot) => {
        try {
          onTrips(
            snapshot.docs.map((document) =>
              parseTrip(document.id, document.data({ serverTimestamps: 'estimate' })),
            ),
          )
        } catch (error) {
          // A parse failure is data corruption, not a rule rejection. Route it
          // through the same error channel so the sidebar shows one message
          // instead of an uncaught exception inside the SDK callback.
          onError(error)
        }
      },
      error: onError,
    },
  )
}
