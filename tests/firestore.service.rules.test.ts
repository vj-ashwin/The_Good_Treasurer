/**
 * Service-layer integration tests, run against the Firestore emulator.
 *
 * `firestore.rules.test.ts` proves the rules accept or reject hand-written
 * documents. This suite proves the *app's own writers* produce documents those
 * rules accept — the gap between "the rules are right" and "the code obeys
 * them". It also exercises the read path (listeners, single read, parsing) end
 * to end.
 *
 * Run with: npm run test:rules
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import {
  addPerson,
  createTrip,
  getTrip,
  isUuid,
  ValidationError,
  watchPeople,
  watchTrips,
  type Person,
  type Trip,
} from '../src/lib/firestore'

const PROJECT_ID = 'demo-the-good-treasurer'
const OWNER = 'owner-uid'
const INTRUDER = 'intruder-uid'

let testEnv: RulesTestEnvironment

const asOwner = (): Firestore => testEnv.authenticatedContext(OWNER).firestore()
const asIntruder = (): Firestore => testEnv.authenticatedContext(INTRUDER).firestore()

/** Waits for the first emission of a listener, then unsubscribes. */
function firstEmission<T>(
  subscribe: (
    onValue: (value: T) => void,
    onError: (error: unknown) => void,
  ) => () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    let settled = false
    unsubscribe = subscribe(
      (value) => {
        if (settled) return
        settled = true
        unsubscribe?.()
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        unsubscribe?.()
        reject(error)
      },
    )
  })
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8088').split(':')
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host,
      port: Number(port),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('createTrip', () => {
  test('writes a document the rules accept and mints a UUID id', async () => {
    const db = asOwner()
    const { id } = await createTrip(db, OWNER, 'Goa 2026')

    expect(isUuid(id)).toBe(true)
    const stored = await getDoc(doc(db, 'users', OWNER, 'trips', id))
    expect(stored.exists()).toBe(true)
    expect(stored.data()).toMatchObject({ name: 'Goa 2026' })
    expect(stored.data()?.createdAt).toBeTruthy()
    expect(stored.data()?.updatedAt).toBeTruthy()
  })

  test('trims the name before writing', async () => {
    const db = asOwner()
    const { id } = await createTrip(db, OWNER, '   Goa 2026   ')
    expect((await getTrip(db, OWNER, id))?.name).toBe('Goa 2026')
  })

  test('rejects an empty or over-long name before touching Firestore', async () => {
    const db = asOwner()
    await expect(createTrip(db, OWNER, '   ')).rejects.toBeInstanceOf(ValidationError)
    await expect(createTrip(db, OWNER, 'x'.repeat(101))).rejects.toBeInstanceOf(ValidationError)
    expect((await getDocs(collection(db, 'users', OWNER, 'trips'))).size).toBe(0)
  })

  test('a retried create cannot duplicate the trip, and is rejected rather than applied', async () => {
    // The id is minted before the write, so a retry targets the same document
    // and a second trip can never appear. The rules also pin `createdAt`, so a
    // retried create that sends a fresh server timestamp is treated as an
    // update and denied. Pinned here because it is the real behaviour, not the
    // "silently overwrite" the earlier comment assumed.
    const db = asOwner()
    const { id } = await createTrip(db, OWNER, 'Goa 2026')

    await expect(
      setDoc(doc(db, 'users', OWNER, 'trips', id), {
        name: 'Goa 2026 (retry)',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' })

    expect((await getDocs(collection(db, 'users', OWNER, 'trips'))).size).toBe(1)
    expect((await getTrip(db, OWNER, id))?.name).toBe('Goa 2026')
  })
})

describe('getTrip', () => {
  test('returns the parsed trip, or null when it does not exist', async () => {
    const db = asOwner()
    const { id } = await createTrip(db, OWNER, 'Goa 2026')

    const trip = await getTrip(db, OWNER, id)
    expect(trip).toMatchObject({ id, name: 'Goa 2026' })
    expect(trip?.createdAt).toBeGreaterThan(0)

    expect(await getTrip(db, OWNER, crypto.randomUUID())).toBeNull()
  })

  test('rejects a malformed trip id before querying', async () => {
    await expect(getTrip(asOwner(), OWNER, 'not-a-uuid')).rejects.toBeInstanceOf(ValidationError)
  })

  test('cannot be used by another account to read the owner’s trip', async () => {
    const ownerDb = asOwner()
    const { id } = await createTrip(ownerDb, OWNER, 'Goa 2026')

    // Even if another signed-in user supplies the owner uid, the rules compare
    // the path against their own auth uid and deny the read.
    await expect(getTrip(asIntruder(), OWNER, id)).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })
})

describe('watchTrips', () => {
  test('emits the trips already stored, newest first', async () => {
    const db = asOwner()
    await createTrip(db, OWNER, 'Older trip')
    // Server timestamps have millisecond resolution; keep the two writes in
    // distinct milliseconds so the ordering assertion is deterministic.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const newer = await createTrip(db, OWNER, 'Newer trip')

    const trips = await firstEmission<Trip[]>((onValue, onError) =>
      watchTrips(db, OWNER, onValue, onError),
    )
    expect(trips.map((trip) => trip.name)).toEqual(['Newer trip', 'Older trip'])
    expect(trips[0].id).toBe(newer.id)
  })
})

describe('addPerson', () => {
  test('writes a person the rules accept', async () => {
    const db = asOwner()
    const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
    const person = await addPerson(db, OWNER, tripId, { name: 'Alice', isOrganizer: true })

    expect(isUuid(person.id)).toBe(true)
    const stored = await getDoc(doc(db, 'users', OWNER, 'trips', tripId, 'people', person.id))
    expect(stored.data()).toMatchObject({ name: 'Alice', isOrganizer: true })
  })

  test('defaults isOrganizer to false', async () => {
    const db = asOwner()
    const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
    const person = await addPerson(db, OWNER, tripId, { name: 'Bob' })

    const stored = await getDoc(doc(db, 'users', OWNER, 'trips', tripId, 'people', person.id))
    expect(stored.data()?.isOrganizer).toBe(false)
  })

  test('rejects a blank name and a malformed trip id before writing', async () => {
    const db = asOwner()
    const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
    await expect(addPerson(db, OWNER, tripId, { name: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(addPerson(db, OWNER, 'not-a-uuid', { name: 'Alice' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(
      (await getDocs(collection(db, 'users', OWNER, 'trips', tripId, 'people'))).size,
    ).toBe(0)
  })
})

describe('watchPeople', () => {
  test('emits the people in insertion order', async () => {
    const db = asOwner()
    const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
    await addPerson(db, OWNER, tripId, { name: 'Alice', isOrganizer: true })
    await addPerson(db, OWNER, tripId, { name: 'Bob' })

    const people = await firstEmission<Person[]>((onValue, onError) =>
      watchPeople(db, OWNER, tripId, onValue, onError),
    )
    expect(people.map((person) => person.name)).toEqual(['Alice', 'Bob'])
    expect(people[0].isOrganizer).toBe(true)
  })
})
