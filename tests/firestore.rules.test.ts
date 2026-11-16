/**
 * Security-rules tests, run against the local Firestore emulator.
 *
 * These load `firestore.rules` — the exact file that gets deployed — so a rule
 * cannot pass here and then behave differently in production.
 *
 * Run with: npm run test:rules
 * (Kept out of `npm test` on purpose: that suite must stay pure and offline.)
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-the-good-treasurer'

const OWNER = 'owner-uid'
const INTRUDER = 'intruder-uid'

// Fixed UUIDs keep failures readable. Rules require UUID ids on purpose: a
// stable client-generated id is what makes a retried write idempotent and what
// makes settlement tie-breaking deterministic.
const TRIP = '11111111-1111-4111-8111-111111111111'
const PERSON_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PERSON_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PERSON_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const EXPENSE = 'e0000000-0000-4000-8000-000000000001'
const HISTORY = 'f0000000-0000-4000-8000-000000000001'
const HISTORY_2 = 'f0000000-0000-4000-8000-000000000002'

let testEnv: RulesTestEnvironment

function paths(uid = OWNER, tripId = TRIP) {
  const root = `users/${uid}/trips/${tripId}`
  return {
    trip: root,
    people: `${root}/people`,
    expenses: `${root}/expenses`,
    history: `${root}/history`,
  }
}

/** A trip document that every rule accepts. */
const validTrip = (overrides: Record<string, unknown> = {}) => ({
  name: 'Goa 2026',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
})

const validPerson = (overrides: Record<string, unknown> = {}) => ({
  name: 'Alice',
  isOrganizer: false,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
})

/**
 * ₹3,200 dinner + 18% GST (₹576) + 10% service charge (₹320) = ₹4,096, split
 * evenly across two people (₹2,048 each). This is CUJ 2, so the rules are
 * exercised with the numbers the app will really store.
 */
const validExpense = (overrides: Record<string, unknown> = {}) => ({
  title: 'Dinner',
  date: '2026-11-14',
  category: 'Food',
  payerId: PERSON_A,
  participants: [PERSON_A, PERSON_B],
  baseAmountPaise: 320000,
  gstAmountPaise: 57600,
  serviceChargeAmountPaise: 32000,
  totalPaise: 409600,
  gstBps: 1800,
  serviceChargeBps: 1000,
  gstParts: null,
  lineItems: null,
  shares: { [PERSON_A]: 204800, [PERSON_B]: 204800 },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  deletedAt: null,
  lastHistoryId: HISTORY,
  ...overrides,
})

const validHistory = (overrides: Record<string, unknown> = {}) => ({
  expenseId: EXPENSE,
  action: 'create',
  authorId: OWNER,
  timestamp: serverTimestamp(),
  changedFields: [],
  before: null,
  after: { baseAmountPaise: 320000 },
  ...overrides,
})

const asOwner = (): Firestore => testEnv.authenticatedContext(OWNER).firestore()
const asIntruder = (): Firestore => testEnv.authenticatedContext(INTRUDER).firestore()
const asAnonymous = (): Firestore => testEnv.unauthenticatedContext().firestore()

/** Writes setup data with rules switched off (fixtures only, never assertions). */
async function seed(seedFn: (db: Firestore) => Promise<unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await seedFn(context.firestore())
  })
}

/** Seeds a trip with two people so expense tests have realistic parents. */
async function seedTripWithPeople(): Promise<void> {
  await seed(async (db) => {
    const p = paths()
    await setDoc(doc(db, p.trip), validTrip())
    await setDoc(doc(db, `${p.people}/${PERSON_A}`), validPerson({ name: 'Alice', isOrganizer: true }))
    await setDoc(doc(db, `${p.people}/${PERSON_B}`), validPerson({ name: 'Bob' }))
  })
}

/**
 * The one write shape the app is allowed to use: the expense and its history
 * entry committed together.
 */
async function createExpenseBatch(
  db: Firestore,
  options: {
    expense?: Record<string, unknown>
    history?: Record<string, unknown>
    expenseId?: string
    historyId?: string
  } = {},
) {
  const p = paths()
  const expenseId = options.expenseId ?? EXPENSE
  const historyId = options.historyId ?? HISTORY
  const batch = writeBatch(db)
  batch.set(doc(db, `${p.expenses}/${expenseId}`), options.expense ?? validExpense({ lastHistoryId: historyId }))
  batch.set(doc(db, `${p.history}/${historyId}`), options.history ?? validHistory())
  return batch.commit()
}

async function updateExpenseBatch(
  db: Firestore,
  expenseChanges: Record<string, unknown>,
  options: { historyId?: string; history?: Record<string, unknown> } = {},
) {
  const p = paths()
  const historyId = options.historyId ?? HISTORY_2
  const batch = writeBatch(db)
  batch.update(doc(db, `${p.expenses}/${EXPENSE}`), {
    ...expenseChanges,
    lastHistoryId: historyId,
    updatedAt: serverTimestamp(),
  })
  batch.set(
    doc(db, `${p.history}/${historyId}`),
    options.history ??
      validHistory({
        action: 'update',
        changedFields: ['title'],
        before: { title: 'Dinner' },
        after: { title: 'Dinner (extra)' },
      }),
  )
  return batch.commit()
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ownership: a user only ever touches their own subtree.
// ─────────────────────────────────────────────────────────────────────────────

describe('ownership', () => {
  test('signed-out callers cannot read a trip', async () => {
    await seedTripWithPeople()
    const db = asAnonymous()
    await assertFails(getDoc(doc(db, paths().trip)))
  })

  test('signed-out callers cannot write a trip', async () => {
    const db = asAnonymous()
    await assertFails(setDoc(doc(db, paths().trip), validTrip()))
  })

  test('the owner can read their own trip', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(getDoc(doc(db, paths().trip)))
    await assertSucceeds(getDocs(collection(db, paths().people)))
    await assertSucceeds(getDocs(collection(db, paths().expenses)))
    await assertSucceeds(getDocs(collection(db, paths().history)))
  })

  test('another signed-in user cannot read the owner’s trip', async () => {
    await seedTripWithPeople()
    const db = asIntruder()
    await assertFails(getDoc(doc(db, paths().trip)))
  })

  test('another signed-in user cannot read the owner’s expenses', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asIntruder()
    await assertFails(getDoc(doc(db, `${paths().expenses}/${EXPENSE}`)))
  })

  test('another signed-in user cannot write into the owner’s expenses', async () => {
    await seedTripWithPeople()
    const db = asIntruder()
    await assertFails(createExpenseBatch(db))
  })

  test('another signed-in user cannot list the owner’s trips', async () => {
    await seedTripWithPeople()
    const db = asIntruder()
    await assertFails(getDocs(collection(db, 'users', OWNER, 'trips')))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Trips: permanent, well-formed, never silently re-keyed.
// ─────────────────────────────────────────────────────────────────────────────

describe('trips', () => {
  test('accepts a valid trip', async () => {
    const db = asOwner()
    await assertSucceeds(setDoc(doc(db, paths().trip), validTrip()))
  })

  test('rejects a client-set timestamp instead of the server timestamp', async () => {
    const db = asOwner()
    const forged = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'))
    await assertFails(setDoc(doc(db, paths().trip), validTrip({ createdAt: forged })))
  })

  test('rejects an empty name', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, paths().trip), validTrip({ name: '' })))
  })

  test('rejects a 101-character name', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, paths().trip), validTrip({ name: 'x'.repeat(101) })))
  })

  test('rejects an unknown field', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, paths().trip), validTrip({ currency: 'USD' })))
  })

  test('rejects a non-UUID trip id', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, `${paths().trip}-not-a-uuid`), validTrip()))
  })

  test('allows renaming a trip but never re-dating it', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(updateDoc(doc(db, paths().trip), { name: 'Goa 2027', updatedAt: serverTimestamp() }))
    await assertFails(
      updateDoc(doc(db, paths().trip), {
        createdAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  test('never allows deleting a trip', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(deleteDoc(doc(db, paths().trip)))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. People.
// ─────────────────────────────────────────────────────────────────────────────

describe('people', () => {
  test('accepts a valid person', async () => {
    const db = asOwner()
    await assertSucceeds(setDoc(doc(db, `${paths().people}/${PERSON_A}`), validPerson()))
  })

  test('rejects a non-UUID person id', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, `${paths().people}/person-1`), validPerson()))
  })

  test('rejects a 51-character name', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, `${paths().people}/${PERSON_A}`), validPerson({ name: 'x'.repeat(51) })))
  })

  test('rejects a non-boolean organiser flag', async () => {
    const db = asOwner()
    await assertFails(setDoc(doc(db, `${paths().people}/${PERSON_A}`), validPerson({ isOrganizer: 'yes' })))
  })

  test('allows renaming but never reassigns the organiser', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(updateDoc(doc(db, `${paths().people}/${PERSON_B}`), { name: 'Bobby', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, `${paths().people}/${PERSON_A}`), { isOrganizer: false, updatedAt: serverTimestamp() }))
  })

  test('allows deleting a person (referential check is the People UI’s job)', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(setDoc(doc(db, `${paths().people}/${PERSON_C}`), validPerson({ name: 'Carol' })))
    await assertSucceeds(deleteDoc(doc(db, `${paths().people}/${PERSON_C}`)))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Expenses: the field validation that rules can actually perform.
// ─────────────────────────────────────────────────────────────────────────────

describe('expenses — accepted writes', () => {
  test('accepts the CUJ 2 expense committed together with its history entry', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(createExpenseBatch(db))
  })

  test('accepts a line-item expense with no tax at all', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(
      createExpenseBatch(db, {
        expense: validExpense({
          baseAmountPaise: 240000,
          gstAmountPaise: 0,
          serviceChargeAmountPaise: 0,
          totalPaise: 240000,
          gstBps: null,
          serviceChargeBps: null,
          lineItems: [
            { description: 'Snacks', amountPaise: 80000, consumerIds: [PERSON_A, PERSON_C] },
            { description: 'Drinks', amountPaise: 160000, consumerIds: [PERSON_B] },
          ],
          shares: { [PERSON_A]: 40000, [PERSON_B]: 160000, [PERSON_C]: 40000 },
          participants: [PERSON_A, PERSON_B, PERSON_C],
          payerId: PERSON_B,
        }),
      }),
    )
  })
})

describe('expenses — atomicity with history', () => {
  test('rejects an expense whose history entry is missing from the batch', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(setDoc(doc(db, `${paths().expenses}/${EXPENSE}`), validExpense()))
  })

  test('rejects a history entry written in a later batch', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    // Expense first, pointing at a history id that does not exist yet.
    await assertFails(setDoc(doc(db, `${paths().expenses}/${EXPENSE}`), validExpense()))
    // Then the history entry on its own.
    await assertFails(setDoc(doc(db, `${paths().history}/${HISTORY}`), validHistory()))
  })

  test('rejects a restore entry for an expense that is not deleted', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertFails(
      updateExpenseBatch(db, {}, {
        history: validHistory({
          action: 'restore',
          changedFields: ['deletedAt'],
          before: { deletedAt: null },
          after: { deletedAt: null },
        }),
      }),
    )
  })

  test('rejects an update entry in the batch that creates the expense', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    const p = paths()
    const batch = writeBatch(db)
    batch.set(doc(db, `${p.expenses}/${EXPENSE}`), validExpense({ lastHistoryId: HISTORY }))
    batch.set(doc(db, `${p.history}/${HISTORY}`), validHistory())
    batch.set(doc(db, `${p.history}/${HISTORY_2}`), validHistory({ action: 'update', changedFields: ['title'], before: { title: 'a' }, after: { title: 'b' } }))
    await assertFails(batch.commit())
  })

  test('rejects an expense update with no history entry', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertFails(updateDoc(doc(db, `${paths().expenses}/${EXPENSE}`), { title: 'Renamed', updatedAt: serverTimestamp(), lastHistoryId: HISTORY_2 }))
  })

  test('accepts an update that rewrites shares together with its history entry', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    // ₹3,500 + 18% GST (₹630) + 10% SC (₹350) = ₹4,480, split ₹2,240 each.
    await assertSucceeds(
      updateExpenseBatch(
        db,
        {
          baseAmountPaise: 350000,
          gstAmountPaise: 63000,
          serviceChargeAmountPaise: 35000,
          totalPaise: 448000,
          shares: { [PERSON_A]: 224000, [PERSON_B]: 224000 },
        },
        {
          history: validHistory({
            action: 'update',
            changedFields: ['baseAmountPaise', 'totalPaise'],
            before: { baseAmountPaise: 320000, totalPaise: 409600 },
            after: { baseAmountPaise: 350000, totalPaise: 448000 },
          }),
        },
      ),
    )
  })
})

describe('expenses — field validation', () => {
  const reject = (overrides: Record<string, unknown>) => async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { expense: validExpense({ lastHistoryId: HISTORY, ...overrides }) }))
  }

  test('rejects a zero amount', reject({ baseAmountPaise: 0, totalPaise: 89600 }))
  test('rejects a negative amount', reject({ baseAmountPaise: -1, totalPaise: 89599 }))
  test('rejects a fractional amount', reject({ baseAmountPaise: 320000.5, totalPaise: 409600.5 }))
  test('rejects a total that is not the sum of its parts', reject({ totalPaise: 409601 }))
  test('rejects a GST rate above 100%', reject({ gstBps: 10001 }))
  test('rejects a negative service-charge rate', reject({ serviceChargeBps: -1 }))
  test('rejects an empty participant list', reject({ participants: [], shares: {} }))
  test('rejects duplicated participants', reject({ participants: [PERSON_A, PERSON_A], shares: { [PERSON_A]: 409600 } }))
  test('rejects a payer who is not a participant', reject({ payerId: PERSON_C }))
  test('rejects a participant with no share', reject({ shares: { [PERSON_A]: 409600 } }))
  test('rejects a share for someone who is not a participant', reject({ shares: { [PERSON_A]: 204800, [PERSON_B]: 204800, [PERSON_C]: 0 } }))
  test('rejects a date stored as a timestamp', reject({ date: Timestamp.fromDate(new Date('2026-11-14T00:00:00Z')) }))
  test('rejects a date in the wrong format', reject({ date: '14-11-2026' }))
  test('rejects an empty title', reject({ title: '' }))
  test('rejects an empty category', reject({ category: '' }))
  test('rejects an unknown field', reject({ clientUUID: 'legacy-field' }))
  test('rejects a missing optional field (optionals are written as null)', () => {
    const expense: Record<string, unknown> = validExpense({ lastHistoryId: HISTORY })
    delete expense.gstBps
    return expectRejected(expense)
  })

  test('rejects a missing gstParts key (optionals are written as null)', () => {
    const expense: Record<string, unknown> = validExpense({ lastHistoryId: HISTORY })
    delete expense.gstParts
    return expectRejected(expense)
  })

  async function expectRejected(expense: Record<string, unknown>) {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { expense }))
  }

  test('rejects a non-UUID expense id', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { expenseId: 'expense-1' }))
  })
})

describe('expenses — GST parts', () => {
  const parts = { cgstPaise: 28800, sgstPaise: 28800, igstPaise: 0 }

  const rejectParts = (gstParts: unknown) => async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(
      createExpenseBatch(db, {
        expense: validExpense({ lastHistoryId: HISTORY, gstBps: null, gstParts }),
      }),
    )
  }

  test('accepts a CGST/SGST split that adds up to the fixed GST', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(
      createExpenseBatch(db, {
        expense: validExpense({ lastHistoryId: HISTORY, gstBps: null, gstParts: parts }),
      }),
    )
  })

  test('accepts an inter-state IGST-only bill', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(
      createExpenseBatch(db, {
        expense: validExpense({
          lastHistoryId: HISTORY,
          gstBps: null,
          gstParts: { cgstPaise: 0, sgstPaise: 0, igstPaise: 57600 },
        }),
      }),
    )
  })

  test('rejects parts that do not add up to the GST amount', rejectParts({
    cgstPaise: 100,
    sgstPaise: 100,
    igstPaise: 0,
  }))
  test('rejects a part that is not integer paise', rejectParts({
    cgstPaise: 28800.5,
    sgstPaise: 28799.5,
    igstPaise: 0,
  }))
  test('rejects a negative part', rejectParts({
    cgstPaise: 57600,
    sgstPaise: -1,
    igstPaise: 1,
  }))
  test('rejects an unknown part', rejectParts({ ...parts, vatPaise: 0 }))
  test('rejects a missing part', rejectParts({ cgstPaise: 28800, sgstPaise: 28800 }))
})

describe('expenses — lifecycle', () => {
  test('soft delete is allowed together with its history entry', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertSucceeds(
      updateExpenseBatch(
        db,
        { deletedAt: serverTimestamp() },
        {
          history: validHistory({
            action: 'delete',
            changedFields: ['deletedAt'],
            before: { deletedAt: null },
            after: { deletedAt: serverTimestamp() },
          }),
        },
      ),
    )
  })

  test('restoring a deleted expense is allowed together with its history entry', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
      const p = paths()
      await updateDoc(doc(ownerDb, `${p.expenses}/${EXPENSE}`), {
        deletedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastHistoryId: HISTORY_2,
      })
    })
    const db = asOwner()
    await assertSucceeds(
      updateExpenseBatch(
        db,
        { deletedAt: null },
        {
          history: validHistory({
            action: 'restore',
            changedFields: ['deletedAt'],
            before: { deletedAt: Timestamp.now() },
            after: { deletedAt: null },
          }),
        },
      ),
    )
  })

  test('a soft-deleted expense cannot be edited until it is restored', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
      const p = paths()
      await updateDoc(doc(ownerDb, `${p.expenses}/${EXPENSE}`), {
        deletedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastHistoryId: HISTORY_2,
      })
    })
    const db = asOwner()
    await assertFails(updateExpenseBatch(db, { title: 'Renamed' }))
  })

  test('never allows hard-deleting an expense', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertFails(deleteDoc(doc(db, `${paths().expenses}/${EXPENSE}`)))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. History: append-only, attributable, and bound to the write it describes.
// ─────────────────────────────────────────────────────────────────────────────

describe('history', () => {
  test('accepts a history entry created with its expense', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertSucceeds(createExpenseBatch(db))
    await assertSucceeds(getDoc(doc(db, `${paths().history}/${HISTORY}`)))
  })

  test('rejects rewriting a history entry', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertFails(updateDoc(doc(db, `${paths().history}/${HISTORY}`), { action: 'update' }))
  })

  test('rejects deleting a history entry', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertFails(deleteDoc(doc(db, `${paths().history}/${HISTORY}`)))
  })

  test('rejects an author other than the signed-in user', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { history: validHistory({ authorId: INTRUDER }) }))
  })

  test('rejects a client-set timestamp instead of the server timestamp', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(
      createExpenseBatch(db, { history: validHistory({ timestamp: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) }) }),
    )
  })

  test('rejects an unknown action', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { history: validHistory({ action: 'archive' }) }))
  })

  test('rejects an update entry recorded for a create', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(
      createExpenseBatch(db, {
        history: validHistory({ action: 'update', changedFields: ['title'], before: { title: 'a' }, after: { title: 'b' } }),
      }),
    )
  })

  test('rejects a create entry with changed fields', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { history: validHistory({ changedFields: ['title'] }) }))
  })

  test('rejects change maps that disagree with the declared changed fields', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    await assertFails(
      updateExpenseBatch(db, { title: 'Renamed' }, {
        history: validHistory({
          action: 'update',
          changedFields: ['title'],
          before: { title: 'Dinner' },
          after: { title: 'Renamed', category: 'Food' },
        }),
      }),
    )
  })

  test('rejects a history entry naming a different expense', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    await assertFails(createExpenseBatch(db, { history: validHistory({ expenseId: 'e0000000-0000-4000-8000-000000000002' }) }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Documented gap: what rules provably cannot check.
// ─────────────────────────────────────────────────────────────────────────────

describe('documented gap — history entries', () => {
  test('an entry can be appended to an existing expense outside its write', async () => {
    await seed(async (ownerDb) => {
      await createExpenseBatch(ownerDb)
    })
    const db = asOwner()
    // `existsAfter()` is true for a document that already exists, and
    // `getAfter()` — the only way to read post-batch content — does not work in
    // the Firestore emulator. So a rule cannot tell "this batch wrote the
    // expense" from "the expense was already there", and an extra entry that
    // matches the pre-write state is accepted. No expense can be written
    // without an entry, so the residual risk is a misleading changelog row.
    await assertSucceeds(
      setDoc(
        doc(db, `${paths().history}/${HISTORY_2}`),
        validHistory({ action: 'update', changedFields: ['title'], before: { title: 'a' }, after: { title: 'b' } }),
      ),
    )
  })

  test('two entries claiming the same create are accepted (lastHistoryId cannot be read post-write)', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    const p = paths()
    // Same root cause: the rules cannot confirm that
    // `expense.lastHistoryId === historyId`. Both entries below claim the same
    // create and both are accepted; only `lastHistoryId` says which one the
    // expense actually points at.
    const batch = writeBatch(db)
    batch.set(doc(db, `${p.expenses}/${EXPENSE}`), validExpense({ lastHistoryId: HISTORY }))
    batch.set(doc(db, `${p.history}/${HISTORY}`), validHistory())
    batch.set(doc(db, `${p.history}/${HISTORY_2}`), validHistory({ expenseId: EXPENSE }))
    await assertSucceeds(batch.commit())
  })
})

describe('documented gap — shares arithmetic', () => {
  test('rules cannot reject non-integer share values (enforced by the read-time invariant check instead)', async () => {
    await seedTripWithPeople()
    const db = asOwner()
    // The rules language has no loops and no aggregate functions, so it cannot
    // sum a map. This test pins that limitation down: if a future rules
    // language adds an aggregate, this test should be deleted with the gap.
    // The money layer's property tests and the read-time invariant check are
    // what actually guarantee `sum(shares) === totalPaise`.
    await assertSucceeds(
      createExpenseBatch(db, {
        expense: validExpense({
          lastHistoryId: HISTORY,
          shares: { [PERSON_A]: 204800.5, [PERSON_B]: 204799.5 },
        }),
      }),
    )
  })
})
