/**
 * People reads and writes.
 *
 * A person lives in a subcollection of their trip, never on the trip document:
 * renaming one person must not rewrite the whole trip, and the trip document
 * stays tiny.
 *
 * Deleting is guarded. PRD OQ8 and docs/LOGIC.md §6 both refuse a delete while
 * any expense still references the person, because a dangling participant id
 * would make a stored share unresolvable. The check is a query and therefore
 * runs here, not in the rules — see docs/FIRESTORE.md §5.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { newId } from './ids'
import { parsePerson, requireName, PERSON_NAME_MAX, ValidationError, type Person } from './models'
import { expensesPath, peoplePath } from './paths'

/** The fields the organiser supplies when adding a person. */
export interface NewPerson {
  name: string
  /** Defaults to `false`; the organiser is marked explicitly when added. */
  isOrganizer?: boolean
}

export interface CreatedPerson {
  id: string
}

/** Adds one person to a trip and returns their client-generated id. */
export async function addPerson(
  db: Firestore,
  uid: string,
  tripId: string,
  input: NewPerson,
): Promise<CreatedPerson> {
  const name = requireName(input.name, PERSON_NAME_MAX, 'Person name')
  const id = newId()
  const personRef = doc(db, peoplePath(uid, tripId), id)

  try {
    await setDoc(personRef, {
      name,
      isOrganizer: input.isOrganizer ?? false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    // Same retry rule as the other creates: a lost response means the document
    // is already there, and reporting an error for a successful write would
    // invite a duplicate.
    const existing = await getDoc(personRef)
    if (existing.exists()) return { id }
    throw error
  }

  return { id }
}

/**
 * True when any expense — live or soft-deleted — still names this person.
 *
 * Soft-deleted expenses count on purpose: restoring one would bring back a
 * share for someone who no longer exists.
 */
export async function personIsReferenced(
  db: Firestore,
  uid: string,
  tripId: string,
  personId: string,
): Promise<boolean> {
  const snapshot = await getDocs(
    query(
      collection(db, expensesPath(uid, tripId)),
      where('participants', 'array-contains', personId),
    ),
  )
  return !snapshot.empty
}

/**
 * Deletes a person who has no expenses.
 *
 * The query-then-delete pair is not a transaction: rules cannot check a query,
 * and a single organiser on one device is the whole threat model. The worst
 * case is a person removed a moment before an offline expense that names them
 * syncs, which the report renders as "Removed person" — it cannot change an
 * amount.
 */
export async function deletePerson(
  db: Firestore,
  uid: string,
  tripId: string,
  personId: string,
): Promise<void> {
  if (await personIsReferenced(db, uid, tripId, personId)) {
    throw new ValidationError('This person has expenses and cannot be deleted.')
  }
  await deleteDoc(doc(db, peoplePath(uid, tripId), personId))
}

/**
 * Subscribes to the people in one trip, oldest first.
 *
 * As with trips this is a listener, so a person added offline appears
 * immediately from the local cache and keeps their place once synced.
 */
export function watchPeople(
  db: Firestore,
  uid: string,
  tripId: string,
  onPeople: (people: Person[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const people = collection(db, peoplePath(uid, tripId))
  return onSnapshot(
    query(people, orderBy('createdAt', 'asc')),
    {
      next: (snapshot) => {
        try {
          onPeople(
            snapshot.docs.map((document) =>
              parsePerson(document.id, document.data({ serverTimestamps: 'estimate' })),
            ),
          )
        } catch (error) {
          // Corrupt data goes down the error channel rather than escaping the
          // SDK callback as an unhandled exception.
          onError(error)
        }
      },
      error: onError,
    },
  )
}
