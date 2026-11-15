/**
 * Firestore path builders.
 *
 * Every path starts at `users/{uid}`, which is the single-user invariant: one
 * account only ever reads or writes its own subtree. Building paths here (and
 * validating the segments) means no component or service has to hand-assemble
 * a path string.
 */

import { isUuid } from './ids'
import { ValidationError } from './models'

/** The signed-in user's uid, or a friendly failure if the caller has none. */
export function requireUid(uid: string): string {
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    throw new ValidationError('You must be signed in to do that.')
  }
  return uid
}

/** A document id, rejected early when it is not the UUID the rules require. */
export function requireId(id: string, label: string): string {
  if (!isUuid(id)) {
    throw new ValidationError(`${label} is not a valid id.`)
  }
  return id
}

export function tripsPath(uid: string): string {
  return `users/${requireUid(uid)}/trips`
}

export function tripPath(uid: string, tripId: string): string {
  return `${tripsPath(uid)}/${requireId(tripId, 'Trip')}`
}

export function peoplePath(uid: string, tripId: string): string {
  return `${tripPath(uid, tripId)}/people`
}
