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
  createExpense,
  createTrip,
  createTripWithPeople,
  ExpenseConflictError,
  getTrip,
  isUuid,
  restoreExpense,
  softDeleteExpense,
  updateExpense,
  ValidationError,
  watchPeople,
  watchTrips,
  type NewExpense,
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

describe('createTripWithPeople', () => {
  test('creates the trip and four people in one batch, first person is organiser', async () => {
    const db = asOwner()
    const { id, personIds } = await createTripWithPeople(db, OWNER, {
      name: 'Goa 2026',
      people: ['Alice', 'Bob', 'Carol', 'Dave'],
    })

    expect((await getTrip(db, OWNER, id))?.name).toBe('Goa 2026')
    expect(personIds).toHaveLength(4)

    const people = await Promise.all(
      personIds.map((personId) =>
        getDoc(doc(db, 'users', OWNER, 'trips', id, 'people', personId)),
      ),
    )
    expect(people.map((person) => person.data()?.name)).toEqual([
      'Alice',
      'Bob',
      'Carol',
      'Dave',
    ])
    expect(people.map((person) => person.data()?.isOrganizer)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  test('rejects an invalid person name before writing anything', async () => {
    const db = asOwner()
    await expect(
      createTripWithPeople(db, OWNER, { name: 'Goa 2026', people: ['Alice', '   '] }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect((await getDocs(collection(db, 'users', OWNER, 'trips'))).size).toBe(0)
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

function equalExpenseInput(aliceId: string, bobId: string): NewExpense {
  return {
    title: 'Dinner',
    date: '2026-11-16',
    category: 'Food',
    payerId: aliceId,
    participants: [aliceId, bobId],
    mode: 'equal',
    baseAmountPaise: 120_000,
  }
}

async function seedExpense(
  db: Firestore,
): Promise<{ tripId: string; expenseId: string; input: NewExpense }> {
  const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
  const alice = await addPerson(db, OWNER, tripId, { name: 'Alice', isOrganizer: true })
  const bob = await addPerson(db, OWNER, tripId, { name: 'Bob' })
  const input = equalExpenseInput(alice.id, bob.id)
  const created = await createExpense(db, OWNER, tripId, input)
  return { tripId, expenseId: created.id, input }
}

/** The current server `updatedAt` of an expense, in epoch milliseconds. */
async function updatedAtOf(
  db: Firestore,
  tripId: string,
  expenseId: string,
): Promise<number> {
  const snapshot = await getDoc(
    doc(db, 'users', OWNER, 'trips', tripId, 'expenses', expenseId),
  )
  const value: unknown = snapshot.data()?.updatedAt
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis()
  }
  return 0
}

function historyOf(db: Firestore, tripId: string) {
  return getDocs(collection(db, 'users', OWNER, 'trips', tripId, 'history'))
}

describe('expense lifecycle', () => {
  test('createExpense writes the expense and its create entry in one batch', async () => {
    const db = asOwner()
    const { tripId, expenseId } = await seedExpense(db)

    const stored = await getDoc(doc(db, 'users', OWNER, 'trips', tripId, 'expenses', expenseId))
    expect(stored.data()).toMatchObject({ title: 'Dinner', totalPaise: 120_000, deletedAt: null })

    const history = await historyOf(db, tripId)
    expect(history.size).toBe(1)
    expect(history.docs[0].data()).toMatchObject({ expenseId, action: 'create' })
  })

  test('softDeleteExpense stamps deletedAt and appends a delete entry', async () => {
    const db = asOwner()
    const { tripId, expenseId } = await seedExpense(db)

    await softDeleteExpense(db, OWNER, tripId, expenseId)

    const stored = await getDoc(doc(db, 'users', OWNER, 'trips', tripId, 'expenses', expenseId))
    expect(stored.data()?.deletedAt).toBeTruthy()

    const history = await historyOf(db, tripId)
    expect(history.size).toBe(2)
    const deletion = history.docs.map((entry) => entry.data()).find((entry) => entry.action === 'delete')
    expect(deletion).toMatchObject({
      expenseId,
      changedFields: ['deletedAt'],
      before: { deletedAt: null },
    })
    const linked = history.docs.find((entry) => entry.id === stored.data()?.lastHistoryId)
    expect(linked?.data()).toMatchObject({ expenseId, action: 'delete' })
  })

  test('restoreExpense clears deletedAt and appends a restore entry', async () => {
    const db = asOwner()
    const { tripId, expenseId } = await seedExpense(db)
    await softDeleteExpense(db, OWNER, tripId, expenseId)

    await restoreExpense(db, OWNER, tripId, expenseId)

    const stored = await getDoc(doc(db, 'users', OWNER, 'trips', tripId, 'expenses', expenseId))
    expect(stored.data()?.deletedAt).toBeNull()

    const history = await historyOf(db, tripId)
    expect(history.docs.map((entry) => entry.data().action).sort()).toEqual([
      'create',
      'delete',
      'restore',
    ])
  })

  test('refuses to delete twice and to restore a live expense', async () => {
    const db = asOwner()
    const { tripId, expenseId } = await seedExpense(db)

    await expect(restoreExpense(db, OWNER, tripId, expenseId)).rejects.toBeInstanceOf(
      ValidationError,
    )

    await softDeleteExpense(db, OWNER, tripId, expenseId)
    await expect(softDeleteExpense(db, OWNER, tripId, expenseId)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('expense tax entry', () => {
  test('stores a fixed GST split of CGST/SGST/IGST', async () => {
    const db = asOwner()
    const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
    const alice = await addPerson(db, OWNER, tripId, { name: 'Alice', isOrganizer: true })
    const bob = await addPerson(db, OWNER, tripId, { name: 'Bob' })

    const created = await createExpense(db, OWNER, tripId, {
      ...equalExpenseInput(alice.id, bob.id),
      gstAmountPaise: 18_000,
      gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
    })

    const stored = await getDoc(
      doc(db, 'users', OWNER, 'trips', tripId, 'expenses', created.id),
    )
    expect(stored.data()).toMatchObject({
      baseAmountPaise: 120_000,
      gstAmountPaise: 18_000,
      gstBps: null,
      gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
      totalPaise: 138_000,
      shares: { [alice.id]: 69_000, [bob.id]: 69_000 },
    })
  })

  test('rejects a bill dated in the future', async () => {
    const db = asOwner()
    const { id: tripId } = await createTrip(db, OWNER, 'Goa 2026')
    const alice = await addPerson(db, OWNER, tripId, { name: 'Alice', isOrganizer: true })
    const bob = await addPerson(db, OWNER, tripId, { name: 'Bob' })

    await expect(
      createExpense(db, OWNER, tripId, {
        ...equalExpenseInput(alice.id, bob.id),
        date: '2999-01-01',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('updateExpense', () => {
  test('rewrites the fields and appends an update entry with before/after', async () => {
    const db = asOwner()
    const { tripId, expenseId, input } = await seedExpense(db)

    await updateExpense(db, OWNER, tripId, expenseId, { ...input, title: 'Dinner (extra)' })

    const stored = await getDoc(
      doc(db, 'users', OWNER, 'trips', tripId, 'expenses', expenseId),
    )
    expect(stored.data()).toMatchObject({ title: 'Dinner (extra)', totalPaise: 120_000 })

    const history = await historyOf(db, tripId)
    const update = history.docs.map((entry) => entry.data()).find((entry) => entry.action === 'update')
    expect(update).toMatchObject({
      expenseId,
      changedFields: ['title'],
      before: { title: 'Dinner' },
      after: { title: 'Dinner (extra)' },
    })
    const linked = history.docs.find((entry) => entry.id === stored.data()?.lastHistoryId)
    expect(linked?.data()).toMatchObject({ action: 'update' })
  })

  test('rejects a write based on a stale version with ExpenseConflictError', async () => {
    const db = asOwner()
    const { tripId, expenseId, input } = await seedExpense(db)
    const baseline = await updatedAtOf(db, tripId, expenseId)

    // Distinct server timestamps have millisecond resolution.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await updateExpense(db, OWNER, tripId, expenseId, { ...input, title: 'First edit' }, {
      expectedUpdatedAt: baseline,
    })

    await expect(
      updateExpense(db, OWNER, tripId, expenseId, { ...input, title: 'Second edit' }, {
        expectedUpdatedAt: baseline,
      }),
    ).rejects.toBeInstanceOf(ExpenseConflictError)
  })

  test('force keeps mine and overwrites the conflicting cloud copy', async () => {
    const db = asOwner()
    const { tripId, expenseId, input } = await seedExpense(db)
    const baseline = await updatedAtOf(db, tripId, expenseId)

    await new Promise((resolve) => setTimeout(resolve, 10))
    await updateExpense(db, OWNER, tripId, expenseId, { ...input, title: 'Their edit' }, {
      expectedUpdatedAt: baseline,
    })
    await updateExpense(db, OWNER, tripId, expenseId, { ...input, title: 'My edit' }, {
      expectedUpdatedAt: baseline,
      force: true,
    })

    const stored = await getDoc(
      doc(db, 'users', OWNER, 'trips', tripId, 'expenses', expenseId),
    )
    expect(stored.data()?.title).toBe('My edit')
  })

  test('rejects a no-op edit instead of writing an empty history entry', async () => {
    const db = asOwner()
    const { tripId, expenseId, input } = await seedExpense(db)

    await expect(updateExpense(db, OWNER, tripId, expenseId, input)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect((await historyOf(db, tripId)).size).toBe(1)
  })

  test('refuses to edit a soft-deleted expense', async () => {
    const db = asOwner()
    const { tripId, expenseId, input } = await seedExpense(db)
    await softDeleteExpense(db, OWNER, tripId, expenseId)

    await expect(
      updateExpense(db, OWNER, tripId, expenseId, { ...input, title: 'Renamed' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  test('refuses to update an expense that no longer exists', async () => {
    const db = asOwner()
    const { tripId, input } = await seedExpense(db)

    await expect(
      updateExpense(db, OWNER, tripId, crypto.randomUUID(), { ...input, title: 'Renamed' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
