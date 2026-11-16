import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  DataError,
  PERSON_NAME_MAX,
  TRIP_NAME_MAX,
  ValidationError,
  parsePerson,
  parseHistoryEntry,
  parseTrip,
  requireName,
} from './models'

const created = Timestamp.fromMillis(1_700_000_000_000)

const tripData = (overrides: Record<string, unknown> = {}) => ({
  name: 'Goa 2026',
  createdAt: created,
  updatedAt: created,
  ...overrides,
})

const personData = (overrides: Record<string, unknown> = {}) => ({
  name: 'Alice',
  isOrganizer: true,
  createdAt: created,
  updatedAt: created,
  ...overrides,
})

describe('requireName', () => {
  it('trims the name and enforces non-empty input', () => {
    expect(requireName('  Goa 2026  ', TRIP_NAME_MAX, 'Trip name')).toBe('Goa 2026')
    expect(() => requireName('   ', TRIP_NAME_MAX, 'Trip name')).toThrow(ValidationError)
    expect(() => requireName('', TRIP_NAME_MAX, 'Trip name')).toThrow('Trip name cannot be empty.')
  })

  it('rejects a name longer than the rules allow, and non-text input', () => {
    expect(() =>
      requireName('x'.repeat(TRIP_NAME_MAX + 1), TRIP_NAME_MAX, 'Trip name'),
    ).toThrow('Trip name must be 100 characters or fewer.')
    expect(() => requireName(42, TRIP_NAME_MAX, 'Trip name')).toThrow('Trip name must be text.')
  })
})

describe('parseTrip', () => {
  it('converts stored timestamps to epoch milliseconds', () => {
    expect(parseTrip('trip-1', tripData())).toEqual({
      id: 'trip-1',
      name: 'Goa 2026',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
  })

  it('accepts a Timestamp-like object, not only the SDK class', () => {
    const fakeTimestamp = { toMillis: () => 1234 }
    expect(parseTrip('trip-1', tripData({ createdAt: fakeTimestamp })).createdAt).toBe(1234)
  })

  it('reads an unsynced serverTimestamp as 0 rather than throwing', () => {
    // An offline write is visible from the local cache before the server has
    // resolved serverTimestamp(); the sidebar must still be able to render it.
    expect(parseTrip('trip-1', tripData({ createdAt: null })).createdAt).toBe(0)
    expect(parseTrip('trip-1', tripData({ updatedAt: undefined })).updatedAt).toBe(0)
  })

  it('rejects missing data and corrupt fields with a DataError', () => {
    expect(() => parseTrip('trip-1', undefined)).toThrow(DataError)
    expect(() => parseTrip('trip-1', tripData({ name: '' }))).toThrow(DataError)
    expect(() => parseTrip('trip-1', tripData({ name: 7 }))).toThrow(DataError)
    expect(() => parseTrip('trip-1', tripData({ createdAt: 'yesterday' }))).toThrow(DataError)
  })
})

describe('parsePerson', () => {
  it('parses a person document', () => {
    expect(parsePerson('person-1', personData())).toEqual({
      id: 'person-1',
      name: 'Alice',
      isOrganizer: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
  })

  it('rejects a non-boolean organiser flag', () => {
    expect(() => parsePerson('person-1', personData({ isOrganizer: 'yes' }))).toThrow(DataError)
  })

  it('uses the stricter person name limit', () => {
    expect(() =>
      parsePerson('person-1', personData({ name: 'x'.repeat(PERSON_NAME_MAX + 1) })),
    ).toThrow(DataError)
  })
})

const historyData = (overrides: Record<string, unknown> = {}) => ({
  expenseId: '8f14e45f-ceea-4a7f-9b2a-1d0a3f4c5b6d',
  action: 'delete',
  authorId: 'user-1',
  timestamp: created,
  changedFields: ['deletedAt'],
  before: { deletedAt: null },
  after: { deletedAt: created },
  ...overrides,
})

describe('parseHistoryEntry', () => {
  it('parses a changelog entry and converts its timestamp', () => {
    expect(parseHistoryEntry('entry-1', historyData())).toEqual({
      id: 'entry-1',
      expenseId: '8f14e45f-ceea-4a7f-9b2a-1d0a3f4c5b6d',
      action: 'delete',
      authorId: 'user-1',
      timestamp: 1_700_000_000_000,
      changedFields: ['deletedAt'],
      before: { deletedAt: null },
      after: { deletedAt: created },
    })
  })

  it('reads all four actions', () => {
    for (const action of ['create', 'update', 'delete', 'restore']) {
      expect(parseHistoryEntry('entry-1', historyData({ action })).action).toBe(action)
    }
  })

  it('reads an unsynced serverTimestamp as 0', () => {
    expect(parseHistoryEntry('entry-1', historyData({ timestamp: null })).timestamp).toBe(0)
  })

  it('accepts null before/after snapshots (create has no before)', () => {
    const entry = parseHistoryEntry('entry-1', historyData({ action: 'create', before: null }))
    expect(entry.before).toBeNull()
  })

  it('rejects unknown actions, empty ids and malformed snapshots', () => {
    expect(() => parseHistoryEntry('entry-1', historyData({ action: 'archive' }))).toThrow(DataError)
    expect(() => parseHistoryEntry('entry-1', historyData({ expenseId: '' }))).toThrow(DataError)
    expect(() => parseHistoryEntry('entry-1', historyData({ authorId: '' }))).toThrow(DataError)
    expect(() => parseHistoryEntry('entry-1', historyData({ before: [] }))).toThrow(DataError)
    expect(() => parseHistoryEntry('entry-1', undefined)).toThrow(DataError)
  })

  it('rejects a changedFields list that is not a unique list of names', () => {
    expect(() => parseHistoryEntry('entry-1', historyData({ changedFields: 'deletedAt' }))).toThrow(
      DataError,
    )
    expect(() =>
      parseHistoryEntry('entry-1', historyData({ changedFields: ['deletedAt', 'deletedAt'] })),
    ).toThrow(DataError)
    expect(() => parseHistoryEntry('entry-1', historyData({ changedFields: [''] }))).toThrow(
      DataError,
    )
  })
})
