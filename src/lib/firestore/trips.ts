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
  updateDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { newId } from './ids'
import {
  parseTrip,
  requireName,
  PERSON_NAME_MAX,
  TRIP_NAME_MAX,
  ValidationError,
  type Trip,
} from './models'
import { peoplePath, tripPath, tripsPath } from './paths'

/** What a successful create returns. The full document arrives via the listener. */
export interface CreatedTrip {
  id: string
}

/** The most people a trip can be created with in one go. */
const MAX_PEOPLE_AT_CREATE = 50

/** Trip name plus the people the organiser typed on the create screen. */
export interface NewTrip {
  name: string
  /** Display names in the order entered. The first one becomes the organiser. */
  people?: readonly string[]
}

/**
 * Creates a trip and its starting people in one atomic batch.
 *
 * A batch means a rejected person name can never leave a half-created trip
 * behind: all documents land or none do. The first person is the organiser
 * (`isOrganizer: true`), which is what makes the create screen's "you, then
 * everyone else" order meaningful.
 *
 * Ids are minted before the write, so a retry targets the same documents and
 * can never create a second trip. The rules pin `createdAt` to the first
 * write, so a retried create that sends a new server timestamp is rejected as
 * an update rather than silently applied. `tests/firestore.service.rules.test.ts`
 * pins that behaviour; the offline-retry UX is a separate decision.
 */
export async function createTripWithPeople(
  db: Firestore,
  uid: string,
  input: NewTrip,
): Promise<{ id: string; personIds: string[] }> {
  const name = requireName(input.name, TRIP_NAME_MAX, 'Trip name')
  const people = input.people ?? []
  if (people.length > MAX_PEOPLE_AT_CREATE) {
    throw new ValidationError(
      `A trip can start with at most ${String(MAX_PEOPLE_AT_CREATE)} people.`,
    )
  }
  const personNames = people.map((person, index) =>
    requireName(person, PERSON_NAME_MAX, `Person ${String(index + 1)} name`),
  )

  const tripId = newId()
  const personIds = personNames.map(() => newId())
  const batch = writeBatch(db)

  batch.set(doc(db, tripsPath(uid), tripId), {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  personNames.forEach((personName, index) => {
    batch.set(doc(db, peoplePath(uid, tripId), personIds[index]), {
      name: personName,
      isOrganizer: index === 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })

  try {
    await batch.commit()
  } catch (error) {
    // A lost response means the trip (and its first people) are already
    // committed. Re-running a create with fresh server timestamps would be
    // rejected by the immutable-timestamp rules, so confirm before failing.
    const existing = await getDoc(doc(db, tripPath(uid, tripId)))
    if (existing.exists()) return { id: tripId, personIds }
    throw error
  }
  return { id: tripId, personIds }
}

/** Creates a trip with no people yet. */
export async function createTrip(
  db: Firestore,
  uid: string,
  nameInput: string,
): Promise<CreatedTrip> {
  const { id } = await createTripWithPeople(db, uid, { name: nameInput })
  return { id }
}

/**
 * Renames a trip.
 *
 * Only the name and a fresh `updatedAt` are sent: the rules pin `createdAt` to
 * the document it already holds, so a partial update keeps the creation time
 * untouched. The rename is a plain update, not a batch — nothing else on the
 * trip document participates.
 */
export async function renameTrip(
  db: Firestore,
  uid: string,
  tripId: string,
  nameInput: string,
): Promise<void> {
  const name = requireName(nameInput, TRIP_NAME_MAX, 'Trip name')
  await updateDoc(doc(db, tripPath(uid, tripId)), {
    name,
    updatedAt: serverTimestamp(),
  })
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
