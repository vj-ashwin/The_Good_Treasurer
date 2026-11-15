/**
 * Document ids.
 *
 * The rules require UUID-shaped ids, because a stable client-generated id is
 * what makes a retried write idempotent: the same logical expense reuses the
 * same document id, so a retry after a lost response overwrites one document
 * instead of creating a second one.
 *
 * This is the PRD's `clientUUID` field, promoted to the document id itself —
 * enforced by the database rather than by convention.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** True when `value` is a lowercase, hyphenated UUID as the rules expect. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * A fresh document id, generated on the client and never by Firestore.
 *
 * `crypto.randomUUID()` returns lowercase hex, so the result always satisfies
 * `firestore.rules`. The check is a cheap guard against a polyfill that does
 * not.
 */
export function newId(): string {
  const id = crypto.randomUUID()
  if (!isUuid(id)) {
    throw new Error('crypto.randomUUID() returned a value that is not a UUID')
  }
  return id
}
