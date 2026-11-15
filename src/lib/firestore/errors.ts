/**
 * User-facing text for Firestore failures.
 *
 * Every service call can fail; none of them should hand a raw SDK error to a
 * component. This module maps Firebase's error codes to one readable sentence
 * each, and stays deliberately silent about the raw message so nothing
 * environment-specific can leak into the UI.
 */

export interface FirestoreErrorLike {
  code?: unknown
  message?: unknown
}

/** The `code` string of a Firebase error, or `null` for anything else. */
export function firestoreErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as FirestoreErrorLike).code
  return typeof code === 'string' ? code : null
}

/**
 * True when the failure is a connectivity problem rather than a rejected write.
 *
 * With persistent cache enabled, writes made offline are queued locally and
 * succeed; this path is mainly for reads and listener failures. The UI uses it
 * to show "offline" rather than "permission denied".
 */
export function isOfflineError(error: unknown): boolean {
  if (firestoreErrorCode(error) === 'unavailable') return true
  if (typeof error !== 'object' || error === null) return false
  const message = (error as FirestoreErrorLike).message
  return typeof message === 'string' && message.toLowerCase().includes('offline')
}

/** A sentence safe to show the organiser for any Firestore failure. */
export function describeFirestoreError(error: unknown): string {
  const code = firestoreErrorCode(error)
  switch (code) {
    case 'permission-denied':
      return 'You do not have permission to change this. Sign in again and retry.'
    case 'unauthenticated':
      return 'Your session has expired. Sign in again.'
    case 'unavailable':
      return 'You appear to be offline. Changes are saved on this device and will sync when you reconnect.'
    case 'not-found':
      return 'That item no longer exists. Refresh and try again.'
    case 'already-exists':
      return 'That item was already saved.'
    case 'aborted':
      return 'The save was interrupted. Please retry.'
    case 'cancelled':
      return 'The operation was cancelled.'
    case 'deadline-exceeded':
      return 'The request took too long. Please retry.'
    case 'resource-exhausted':
      return 'The database is temporarily at its limit. Try again shortly.'
    case 'failed-precondition':
      return 'The database rejected this change. Refresh the page and retry.'
    case 'invalid-argument':
      return 'Some of those details are not valid. Check the form and retry.'
    default:
      if (isOfflineError(error)) {
        return 'You appear to be offline. Changes are saved on this device and will sync when you reconnect.'
      }
      return 'Something went wrong saving your changes. Please retry.'
  }
}
