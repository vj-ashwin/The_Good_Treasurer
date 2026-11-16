/**
 * JSON backup of one trip (PRD G8 / OQ9).
 *
 * The PDF/PNG report is for humans; this file is for a machine. It contains the
 * trip, its people, every expense (including soft-deleted ones) and the full
 * changelog, so nothing the app knows is left out of a backup.
 *
 * Pure and serialisable: no Firebase, no DOM, no clock. `exportedAt` is passed
 * in, which keeps the output deterministic for tests and lets the caller decide
 * how to stamp it.
 *
 * The schema is versioned. If the document shape ever changes, a reader can
 * branch on `schemaVersion` instead of guessing from the fields.
 */

import type { Expense, HistoryEntry, Person, Trip } from '../firestore'
import type { GstParts } from '../money'

export const BACKUP_SCHEMA_VERSION = 1
export const BACKUP_APP_NAME = 'The Good Treasurer'
export const BACKUP_CURRENCY = 'INR'

export interface BackupTrip {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface BackupPerson {
  id: string
  name: string
  isOrganizer: boolean
  createdAt: number
  updatedAt: number
}

export interface BackupLineItem {
  description: string
  amountPaise: number
  consumerIds: string[]
  gstBps: number
  scBps: number
  gstAmountPaise: number
  serviceChargeAmountPaise: number
}

export interface BackupExpense {
  id: string
  title: string
  date: string
  category: string
  payerId: string
  participants: string[]
  baseAmountPaise: number
  gstAmountPaise: number
  serviceChargeAmountPaise: number
  totalPaise: number
  gstBps: number | null
  serviceChargeBps: number | null
  gstParts: GstParts | null
  lineItems: BackupLineItem[] | null
  shares: Record<string, number>
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  lastHistoryId: string
}

export interface BackupHistoryEntry {
  id: string
  expenseId: string
  action: HistoryEntry['action']
  authorId: string
  timestamp: number
  changedFields: string[]
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface TripBackup {
  app: typeof BACKUP_APP_NAME
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  currency: typeof BACKUP_CURRENCY
  /** ISO timestamp supplied by the caller. */
  exportedAt: string
  trip: BackupTrip
  people: BackupPerson[]
  expenses: BackupExpense[]
  history: BackupHistoryEntry[]
}

export interface BackupSource {
  trip: Trip
  people: readonly Person[]
  expenses: readonly Expense[]
  history: readonly HistoryEntry[]
  exportedAt: string
}

function copyLineItem(line: NonNullable<Expense['lineItems']>[number]): BackupLineItem {
  return {
    description: line.description,
    amountPaise: line.amountPaise,
    consumerIds: [...line.consumerIds],
    gstBps: line.gstBps,
    scBps: line.scBps,
    gstAmountPaise: line.gstAmountPaise,
    serviceChargeAmountPaise: line.serviceChargeAmountPaise,
  }
}

function copyExpense(expense: Expense): BackupExpense {
  return {
    id: expense.id,
    title: expense.title,
    date: expense.date,
    category: expense.category,
    payerId: expense.payerId,
    participants: [...expense.participants],
    baseAmountPaise: expense.baseAmountPaise,
    gstAmountPaise: expense.gstAmountPaise,
    serviceChargeAmountPaise: expense.serviceChargeAmountPaise,
    totalPaise: expense.totalPaise,
    gstBps: expense.gstBps,
    serviceChargeBps: expense.serviceChargeBps,
    gstParts: expense.gstParts === null ? null : { ...expense.gstParts },
    lineItems: expense.lineItems === null ? null : expense.lineItems.map(copyLineItem),
    shares: { ...expense.shares },
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    deletedAt: expense.deletedAt,
    lastHistoryId: expense.lastHistoryId,
  }
}

function copyHistory(entry: HistoryEntry): BackupHistoryEntry {
  return {
    id: entry.id,
    expenseId: entry.expenseId,
    action: entry.action,
    authorId: entry.authorId,
    timestamp: entry.timestamp,
    changedFields: [...entry.changedFields],
    before: entry.before === null ? null : { ...entry.before },
    after: entry.after === null ? null : { ...entry.after },
  }
}

/** Builds a detached, serialisable backup of one trip. */
export function buildTripBackup(source: BackupSource): TripBackup {
  return {
    app: BACKUP_APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    currency: BACKUP_CURRENCY,
    exportedAt: source.exportedAt,
    trip: {
      id: source.trip.id,
      name: source.trip.name,
      createdAt: source.trip.createdAt,
      updatedAt: source.trip.updatedAt,
    },
    people: source.people.map((person) => ({
      id: person.id,
      name: person.name,
      isOrganizer: person.isOrganizer,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    })),
    expenses: source.expenses.map(copyExpense),
    history: source.history.map(copyHistory),
  }
}

/** The pretty-printed JSON a download will contain. */
export function serializeTripBackup(backup: TripBackup): string {
  return JSON.stringify(backup, null, 2)
}

/**
 * A filesystem-safe base name, e.g. `goa-2026-backup-2026-11-16`.
 *
 * Same slug rules as the report export: ASCII letters, digits and single
 * dashes, so the name is valid on every platform and locale.
 */
export function backupFileBase(tripName: string, generatedAt: number): string {
  const slug = tripName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const date = new Date(generatedAt).toISOString().slice(0, 10)
  return `${slug || 'trip'}-backup-${date}`
}
