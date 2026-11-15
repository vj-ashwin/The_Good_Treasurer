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

/** Limits enforced by `firestore.rules`; the client rejects early with a nicer message. */
export const TRIP_NAME_MAX = 100
export const PERSON_NAME_MAX = 50

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
function readMillis(value: unknown, field: string, id: string): number {
  if (value === null || value === undefined) return 0
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis()
  }
  throw new DataError(`Trip document ${id} has an invalid ${field} timestamp.`)
}

/** Parses one trip document, throwing `DataError` when it cannot be trusted. */
export function parseTrip(id: string, data: Record<string, unknown> | undefined): Trip {
  if (!data) throw new DataError(`Trip document ${id} has no data.`)
  return {
    id,
    name: readName(data.name, TRIP_NAME_MAX, `Trip ${id} name`),
    createdAt: readMillis(data.createdAt, 'createdAt', id),
    updatedAt: readMillis(data.updatedAt, 'updatedAt', id),
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
    createdAt: readMillis(data.createdAt, 'createdAt', id),
    updatedAt: readMillis(data.updatedAt, 'updatedAt', id),
  }
}
