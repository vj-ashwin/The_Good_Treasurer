/**
 * Domain models for the Firestore layer.
 *
 * Firestore stores `Timestamp` values; the rest of the app works in epoch
 * milliseconds so components never need to import the Firebase SDK just to
 * render a date. Conversion happens exactly once, here, on the read path.
 *
 * Two failure modes are distinguished on purpose:
 *
 * - `ValidationError` — the organiser typed something unusable. The message is
 *   safe to show in the form.
 * - `DataError` — a stored document does not have the shape the rules promise.
 *   This is corruption or a stale local cache, never user input.
 */

import { Timestamp } from 'firebase/firestore'
import type { GstParts, StoredLineItem } from '../money'
import { isCalendarDate, todayIso } from '../format'

/** A trip document. Trips are permanent; there is no delete state. */
export interface Trip {
  id: string
  name: string
  /** Epoch milliseconds. `0` while an unsynced write has no server timestamp yet. */
  createdAt: number
  /** Epoch milliseconds. `0` while an unsynced write has no server timestamp yet. */
  updatedAt: number
}

/** A participant inside one trip. */
export interface Person {
  id: string
  name: string
  isOrganizer: boolean
  /** Epoch milliseconds. `0` while an unsynced write has no server timestamp yet. */
  createdAt: number
  updatedAt: number
}

/**
 * One expense, as read back from Firestore.
 *
 * `shares` is the source of truth for who owes what: the three split modes are
 * resolved into it once, at write time, and the report never recomputes it.
 */
export interface Expense {
  id: string
  tripId: string
  title: string
  /** `YYYY-MM-DD`; a calendar day, not a timestamp. */
  date: string
  category: string
  payerId: string
  participants: string[]
  baseAmountPaise: number
  gstAmountPaise: number
  serviceChargeAmountPaise: number
  totalPaise: number
  /** The bill-level rates that were typed, or `null` when tax was not entered. */
  gstBps: number | null
  serviceChargeBps: number | null
  /** CGST/SGST/IGST split of a fixed GST amount, or `null`. */
  gstParts: GstParts | null
  /** Itemized mode only; `null` for equal and exact. */
  lineItems: StoredLineItem[] | null
  shares: Record<string, number>
  createdAt: number
  updatedAt: number
  /** `null` while the expense is live; epoch milliseconds once soft-deleted. */
  deletedAt: number | null
  lastHistoryId: string
}

/** Limits enforced by `firestore.rules`; the client rejects early with a nicer message. */
export const TRIP_NAME_MAX = 100
export const PERSON_NAME_MAX = 50
export const EXPENSE_TITLE_MAX = 200
export const CATEGORY_MAX = 50
export const MAX_PARTICIPANTS = 50
export const MAX_LINE_ITEMS = 200

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class DataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataError'
  }
}

/**
 * Trims and validates a name typed by the organiser.
 *
 * Trimming before the length check means a name of only spaces is rejected
 * rather than stored as an empty-looking document the rules would accept.
 */
export function requireName(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be text.`)
  }
  const name = value.trim()
  if (name.length === 0) {
    throw new ValidationError(`${label} cannot be empty.`)
  }
  if (name.length > maxLength) {
    throw new ValidationError(`${label} must be ${String(maxLength)} characters or fewer.`)
  }
  return name
}

function readName(value: unknown, maxLength: number, label: string): string {
  try {
    return requireName(value, maxLength, label)
  } catch (error) {
    throw new DataError(error instanceof Error ? error.message : `${label} is invalid.`)
  }
}

/**
 * Reads a stored timestamp as epoch milliseconds.
 *
 * `null` is accepted because a document written while offline is visible in the
 * local cache before the server has resolved `serverTimestamp()`. Treating that
 * as "pending" (0) is what lets the sidebar render an unsynced trip instead of
 * throwing.
 */
function readMillis(value: unknown, field: string, label: string, id: string): number {
  if (value === null || value === undefined) return 0
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis()
  }
  throw new DataError(`${label} document ${id} has an invalid ${field} timestamp.`)
}

/** Parses one trip document, throwing `DataError` when it cannot be trusted. */
export function parseTrip(id: string, data: Record<string, unknown> | undefined): Trip {
  if (!data) throw new DataError(`Trip document ${id} has no data.`)
  return {
    id,
    name: readName(data.name, TRIP_NAME_MAX, `Trip ${id} name`),
    createdAt: readMillis(data.createdAt, 'createdAt', 'Trip', id),
    updatedAt: readMillis(data.updatedAt, 'updatedAt', 'Trip', id),
  }
}

/** Parses one person document, throwing `DataError` when it cannot be trusted. */
export function parsePerson(id: string, data: Record<string, unknown> | undefined): Person {
  if (!data) throw new DataError(`Person document ${id} has no data.`)
  if (typeof data.isOrganizer !== 'boolean') {
    throw new DataError(`Person document ${id} has a non-boolean isOrganizer field.`)
  }
  return {
    id,
    name: readName(data.name, PERSON_NAME_MAX, `Person ${id} name`),
    isOrganizer: data.isOrganizer,
    createdAt: readMillis(data.createdAt, 'createdAt', 'Person', id),
    updatedAt: readMillis(data.updatedAt, 'updatedAt', 'Person', id),
  }
}

/**
 * Trims and validates a free-text field typed by the organiser.
 *
 * Same contract as `requireName`, but the label is a complete field
 * description such as "Expense title".
 */
export function requireText(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be text.`)
  }
  const text = value.trim()
  if (text.length === 0) {
    throw new ValidationError(`${label} cannot be empty.`)
  }
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${String(maxLength)} characters or fewer.`)
  }
  return text
}

/** Validates an expense date: a real calendar day in `YYYY-MM-DD` form. */
export function requireCalendarDate(value: unknown): string {
  if (typeof value !== 'string' || !isCalendarDate(value)) {
    throw new ValidationError('Date must be a real day in YYYY-MM-DD form.')
  }
  return value
}

/**
 * Rejects a date later than today (PRD observation: an expense cannot have
 * happened yet).
 *
 * The comparison is lexicographic on `YYYY-MM-DD`, which orders correctly for
 * zero-padded calendar dates. `today` is injectable so tests never depend on
 * the wall clock; it defaults to the device's local date.
 */
export function requireNotFutureDate(value: string, today: string = todayIso()): string {
  const date = requireCalendarDate(value)
  if (date > today) {
    throw new ValidationError('Date cannot be in the future.')
  }
  return date
}

/**
 * Validates the participant list: 1–50 unique person ids.
 *
 * The rules enforce the same shape. Membership in the trip's people cannot be
 * checked here without a read per participant, so the form only offers people
 * that exist (see docs/FIRESTORE.md §5).
 */
export function requireParticipants(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('Choose at least one participant.')
  }
  const ids: string[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      throw new ValidationError('Participant ids must be non-empty text.')
    }
    ids.push(candidate)
  }
  if (ids.length === 0) {
    throw new ValidationError('Choose at least one participant.')
  }
  if (ids.length > MAX_PARTICIPANTS) {
    throw new ValidationError(
      `An expense can have at most ${String(MAX_PARTICIPANTS)} participants.`,
    )
  }
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('Each participant can appear only once.')
  }
  return ids
}

function readText(value: unknown, maxLength: number, label: string): string {
  try {
    return requireText(value, maxLength, label)
  } catch (error) {
    throw new DataError(error instanceof Error ? error.message : `${label} is invalid.`)
  }
}

function readInteger(
  value: unknown,
  low: number,
  high: number,
  field: string,
  id: string,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < low || value > high) {
    throw new DataError(`Expense ${id} has an invalid ${field}.`)
  }
  return value
}

function readRate(value: unknown, field: string, id: string): number | null {
  if (value === null || value === undefined) return null
  return readInteger(value, 0, 10_000, field, id)
}

function readLineItems(value: unknown, id: string): StoredLineItem[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINE_ITEMS) {
    throw new DataError(`Expense ${id} has an invalid lineItems list.`)
  }
  return value.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new DataError(`Expense ${id} line item ${String(index)} is not an object.`)
    }
    const line = item as Record<string, unknown>
    const description = readText(
      line.description,
      EXPENSE_TITLE_MAX,
      `Expense ${id} line ${String(index + 1)} description`,
    )
    const amountPaise = readInteger(
      line.amountPaise,
      1,
      Number.MAX_SAFE_INTEGER,
      'line amount',
      id,
    )
    if (!Array.isArray(line.consumerIds) || line.consumerIds.length === 0) {
      throw new DataError(`Expense ${id} line ${String(index + 1)} has no consumers.`)
    }
    const consumerIds = line.consumerIds.map((consumer: unknown) => {
      if (typeof consumer !== 'string' || consumer.length === 0) {
        throw new DataError(`Expense ${id} line ${String(index + 1)} has an invalid consumer.`)
      }
      return consumer
    })
    return {
      description,
      amountPaise,
      consumerIds,
      gstBps: readInteger(line.gstBps, 0, 10_000, 'line GST rate', id),
      scBps: readInteger(line.scBps, 0, 10_000, 'line service-charge rate', id),
      gstAmountPaise: readInteger(
        line.gstAmountPaise,
        0,
        Number.MAX_SAFE_INTEGER,
        'line GST amount',
        id,
      ),
      serviceChargeAmountPaise: readInteger(
        line.serviceChargeAmountPaise,
        0,
        Number.MAX_SAFE_INTEGER,
        'line service-charge amount',
        id,
      ),
    }
  })
}

function readGstParts(value: unknown, gstAmountPaise: number, id: string): GstParts | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DataError(`Expense ${id} has invalid GST parts.`)
  }
  const parts = value as Record<string, unknown>
  const cgstPaise = readInteger(parts.cgstPaise, 0, Number.MAX_SAFE_INTEGER, 'CGST amount', id)
  const sgstPaise = readInteger(parts.sgstPaise, 0, Number.MAX_SAFE_INTEGER, 'SGST amount', id)
  const igstPaise = readInteger(parts.igstPaise, 0, Number.MAX_SAFE_INTEGER, 'IGST amount', id)
  if (cgstPaise + sgstPaise + igstPaise !== gstAmountPaise) {
    throw new DataError(`Expense ${id} GST parts do not sum to its GST amount.`)
  }
  return { cgstPaise, sgstPaise, igstPaise }
}

/** The four transitions the changelog records (docs/LOGIC.md §5.4). */
export type HistoryAction = 'create' | 'update' | 'delete' | 'restore'

/**
 * One entry in a trip's append-only changelog.
 *
 * History lives beside `expenses`, not inside them, so one query reads the
 * whole trip's audit trail (docs/FIRESTORE.md §1). `before`/`after` hold only
 * the fields the write changed, which is what the rules verify.
 */
export interface HistoryEntry {
  id: string
  expenseId: string
  action: HistoryAction
  authorId: string
  /** Epoch milliseconds. `0` while an unsynced write has no server timestamp yet. */
  timestamp: number
  changedFields: string[]
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

const HISTORY_ACTIONS: readonly HistoryAction[] = ['create', 'update', 'delete', 'restore']

/** The most changed fields a history entry may record, matching the rules. */
export const MAX_HISTORY_FIELDS = 50

function readSnapshot(value: unknown, field: string, id: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DataError(`History entry ${id} has an invalid ${field} snapshot.`)
  }
  return { ...(value as Record<string, unknown>) }
}

function readChangedFields(value: unknown, id: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_HISTORY_FIELDS) {
    throw new DataError(`History entry ${id} has an invalid changedFields list.`)
  }
  const fields: string[] = []
  for (const field of value) {
    if (typeof field !== 'string' || field.length === 0) {
      throw new DataError(`History entry ${id} has an invalid changed field name.`)
    }
    fields.push(field)
  }
  if (new Set(fields).size !== fields.length) {
    throw new DataError(`History entry ${id} repeats a changed field.`)
  }
  return fields
}

/** Parses one changelog entry, throwing `DataError` when it cannot be trusted. */
export function parseHistoryEntry(
  id: string,
  data: Record<string, unknown> | undefined,
): HistoryEntry {
  if (!data) throw new DataError(`History entry ${id} has no data.`)
  if (!HISTORY_ACTIONS.includes(data.action as HistoryAction)) {
    throw new DataError(`History entry ${id} has an unknown action.`)
  }
  if (typeof data.expenseId !== 'string' || data.expenseId.length === 0) {
    throw new DataError(`History entry ${id} has no expense id.`)
  }
  if (typeof data.authorId !== 'string' || data.authorId.length === 0) {
    throw new DataError(`History entry ${id} has no author id.`)
  }

  return {
    id,
    expenseId: data.expenseId,
    action: data.action as HistoryAction,
    authorId: data.authorId,
    timestamp: readMillis(data.timestamp, 'timestamp', 'History', id),
    changedFields: readChangedFields(data.changedFields, id),
    before: readSnapshot(data.before, 'before', id),
    after: readSnapshot(data.after, 'after', id),
  }
}

function requireParticipantsForRead(value: unknown, id: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PARTICIPANTS ||
    value.some((candidate) => typeof candidate !== 'string' || candidate.length === 0) ||
    new Set(value).size !== value.length
  ) {
    throw new DataError(`Expense ${id} has an invalid participants list.`)
  }
  return value as string[]
}

/**
 * Parses one expense document, enforcing the arithmetic invariant the rules
 * cannot express.
 *
 * Rules cannot sum a map, so `sum(shares) === totalPaise` is checked here, on
 * every read. A stored expense that fails it is corruption, and surfacing a
 * `DataError` is better than a report that silently loses or invents paise.
 */
export function parseExpense(
  id: string,
  tripId: string,
  data: Record<string, unknown> | undefined,
): Expense {
  if (!data) throw new DataError(`Expense document ${id} has no data.`)

  const title = readText(data.title, EXPENSE_TITLE_MAX, `Expense ${id} title`)
  const category = readText(data.category, CATEGORY_MAX, `Expense ${id} category`)
  const date = data.date
  if (typeof date !== 'string' || !isCalendarDate(date)) {
    throw new DataError(`Expense ${id} has an invalid date.`)
  }

  const participants = requireParticipantsForRead(data.participants, id)
  const payerId = data.payerId
  if (typeof payerId !== 'string' || !participants.includes(payerId)) {
    throw new DataError(`Expense ${id} has a payer who is not a participant.`)
  }

  const baseAmountPaise = readInteger(
    data.baseAmountPaise,
    1,
    Number.MAX_SAFE_INTEGER,
    'base amount',
    id,
  )
  const gstAmountPaise = readInteger(
    data.gstAmountPaise,
    0,
    Number.MAX_SAFE_INTEGER,
    'GST amount',
    id,
  )
  const serviceChargeAmountPaise = readInteger(
    data.serviceChargeAmountPaise,
    0,
    Number.MAX_SAFE_INTEGER,
    'service-charge amount',
    id,
  )
  const totalPaise = readInteger(data.totalPaise, 1, Number.MAX_SAFE_INTEGER, 'total', id)
  if (totalPaise !== baseAmountPaise + gstAmountPaise + serviceChargeAmountPaise) {
    throw new DataError(`Expense ${id} total is not the sum of its parts.`)
  }

  const shares = data.shares
  if (typeof shares !== 'object' || shares === null || Array.isArray(shares)) {
    throw new DataError(`Expense ${id} has no shares map.`)
  }
  const shareEntries = Object.entries(shares as Record<string, unknown>)
  if (shareEntries.length !== participants.length) {
    throw new DataError(`Expense ${id} has a share missing or extra.`)
  }
  let shareTotal = 0n
  const parsedShares: Record<string, number> = {}
  for (const [personId, value] of shareEntries) {
    if (!participants.includes(personId)) {
      throw new DataError(`Expense ${id} has a share for a non-participant.`)
    }
    const share = readInteger(value, 0, Number.MAX_SAFE_INTEGER, 'share', id)
    parsedShares[personId] = share
    shareTotal += BigInt(share)
  }
  if (shareTotal !== BigInt(totalPaise)) {
    throw new DataError(`Expense ${id} shares do not sum to the total.`)
  }

  const deletedAt =
    data.deletedAt === null || data.deletedAt === undefined
      ? null
      : readMillis(data.deletedAt, 'deletedAt', 'Expense', id)

  return {
    id,
    tripId,
    title,
    date,
    category,
    payerId,
    participants,
    baseAmountPaise,
    gstAmountPaise,
    serviceChargeAmountPaise,
    totalPaise,
    gstBps: readRate(data.gstBps, 'GST rate', id),
    serviceChargeBps: readRate(data.serviceChargeBps, 'service-charge rate', id),
    gstParts: readGstParts(data.gstParts, gstAmountPaise, id),
    lineItems: readLineItems(data.lineItems, id),
    shares: parsedShares,
    createdAt: readMillis(data.createdAt, 'createdAt', 'Expense', id),
    updatedAt: readMillis(data.updatedAt, 'updatedAt', 'Expense', id),
    deletedAt,
    lastHistoryId: typeof data.lastHistoryId === 'string' ? data.lastHistoryId : '',
  }
}
