/**
 * People reads and writes.
 *
 * A person lives in a subcollection of their trip, never on the trip document:
 * renaming one person must not rewrite the whole trip, and the trip document
 * stays tiny.
 *
 * There is deliberately no `deletePerson` here yet. PRD OQ8 requires refusing
 * the delete when any expense still references the person, which needs the
 * expense query that arrives with the expense layer. Shipping the unguarded
 * delete now would be a dangling-reference bug waiting for its first caller.
 */

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { newId } from './ids'
import { parsePerson, requireName, PERSON_NAME_MAX, type Person } from './models'
import { peoplePath } from './paths'

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
  await setDoc(doc(db, peoplePath(uid, tripId), id), {
    name,
    isOrganizer: input.isOrganizer ?? false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { id }
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
