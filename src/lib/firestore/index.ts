/**
 * Public surface of the Firestore layer.
 *
 * All functions take the `Firestore` instance explicitly; `src/lib/firebase.ts`
 * owns the configured, persistently cached instance the app passes in.
 */

export { createTrip, getTrip, watchTrips } from './trips'
export type { CreatedTrip } from './trips'
export { addPerson, watchPeople } from './people'
export type { CreatedPerson, NewPerson } from './people'
export { parsePerson, parseTrip, PERSON_NAME_MAX, TRIP_NAME_MAX, DataError, ValidationError } from './models'
export type { Person, Trip } from './models'
export { isUuid, newId } from './ids'
export { describeFirestoreError, firestoreErrorCode, isOfflineError } from './errors'
