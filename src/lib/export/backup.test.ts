import { describe, expect, it } from 'vitest'
import type { Expense, HistoryEntry, Person, Trip } from '../firestore'
import {
  BACKUP_CURRENCY,
  BACKUP_SCHEMA_VERSION,
  backupFileBase,
  buildTripBackup,
  serializeTripBackup,
} from './backup'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const trip: Trip = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Goa 2026',
  createdAt: 1,
  updatedAt: 2,
}

const people: Person[] = [
  { id: A, name: 'Asha', isOrganizer: true, createdAt: 1, updatedAt: 1 },
  { id: B, name: 'Bilal', isOrganizer: false, createdAt: 2, updatedAt: 2 },
]

const expense: Expense = {
  id: '22222222-2222-4222-8222-222222222222',
  tripId: trip.id,
  title: 'Dinner',
  date: '2026-11-14',
  category: 'Food',
  payerId: A,
  participants: [A, B],
  baseAmountPaise: 100_000,
  gstAmountPaise: 18_000,
  serviceChargeAmountPaise: 0,
  totalPaise: 118_000,
  gstBps: null,
  serviceChargeBps: null,
  gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
  lineItems: null,
  shares: { [A]: 59_000, [B]: 59_000 },
  createdAt: 3,
  updatedAt: 4,
  deletedAt: null,
  lastHistoryId: '33333333-3333-4333-8333-333333333333',
}

const history: HistoryEntry[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    expenseId: expense.id,
    action: 'create',
    authorId: A,
    timestamp: 3,
    changedFields: [],
    before: null,
    after: { title: 'Dinner' },
  },
]

const exportedAt = '2026-11-16T10:00:00.000Z'

function build() {
  return buildTripBackup({ trip, people, expenses: [expense], history, exportedAt })
}

describe('buildTripBackup', () => {
  it('stamps the schema, currency and app name', () => {
    const backup = build()
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(backup.currency).toBe(BACKUP_CURRENCY)
    expect(backup.exportedAt).toBe(exportedAt)
  })

  it('includes the trip, people, expenses and history', () => {
    const backup = build()
    expect(backup.trip).toEqual(trip)
    expect(backup.people).toEqual(people)
    expect(backup.expenses).toHaveLength(1)
    expect(backup.history).toHaveLength(1)
  })

  it('keeps the money fields in integer paise', () => {
    const [stored] = build().expenses
    expect(stored.baseAmountPaise).toBe(100_000)
    expect(stored.gstAmountPaise).toBe(18_000)
    expect(stored.totalPaise).toBe(118_000)
    expect(stored.gstParts).toEqual({ cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 })
  })

  it('is detached from the source data', () => {
    const localPeople: Person[] = people.map((person) => ({ ...person }))
    const localExpense: Expense = { ...expense, shares: { ...expense.shares } }
    const localHistory: HistoryEntry[] = history.map((entry) => ({
      ...entry,
      changedFields: [...entry.changedFields],
    }))
    const backup = buildTripBackup({
      trip,
      people: localPeople,
      expenses: [localExpense],
      history: localHistory,
      exportedAt,
    })

    localPeople[0].name = 'Changed'
    localExpense.shares[A] = 1_000
    localHistory[0].changedFields.push('title')

    expect(backup.people[0].name).toBe('Asha')
    expect(backup.expenses[0].shares[A]).toBe(59_000)
    expect(backup.history[0].changedFields).toEqual([])
  })
})

describe('serializeTripBackup', () => {
  it('produces JSON that parses back to the same data', () => {
    const backup = build()
    expect(JSON.parse(serializeTripBackup(backup))).toEqual(backup)
  })
})

describe('backupFileBase', () => {
  it('slugifies the trip name and dates the file', () => {
    expect(backupFileBase('Goa 2026 / Friends!', Date.UTC(2026, 10, 16))).toBe(
      'goa-2026-friends-backup-2026-11-16',
    )
  })

  it('falls back to "trip" for a name with no usable characters', () => {
    expect(backupFileBase('   ', Date.UTC(2026, 10, 16))).toBe('trip-backup-2026-11-16')
  })
})
