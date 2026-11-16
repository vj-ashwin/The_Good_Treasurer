/**
 * Retry a Firestore write through a transient failure.
 *
 * Writes can fail for reasons that fix themselves: the connection dropped in
 * the middle of a commit, the backend was briefly unavailable, or a request
 * timed out. PRD G7 asks for an offline queue with a retry layer, so a save is
 * attempted again instead of being surfaced as a hard failure on the first
 * network hiccup.
 *
 * The operation must be safe to run more than once. Every caller rebuilds a
 * fresh batch inside the operation and keeps its document ids stable, and
 * `commitOnce` confirms an already-applied write before retrying, so a retry
 * can never duplicate an expense or a history entry.
 *
 * A permanent failure — a permission denial, invalid arguments, a failed
 * precondition — is not retried; retrying would only delay the message the
 * organiser needs to see.
 */

import { firestoreErrorCode } from './errors'

export interface RetryPolicy {
  /** Total attempts, including the first one. Must be at least 1. */
  attempts: number
  /** Delay before the second attempt, in milliseconds. */
  baseDelayMs: number
  /** Ceiling for the exponential delay, in milliseconds. */
  maxDelayMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
}

export interface RetryOptions extends Partial<RetryPolicy> {
  /** Injected by tests so no real time passes. */
  sleep?: (ms: number) => Promise<void>
  /** Injected by tests to decide retryability, defaulting to transient codes. */
  isRetryable?: (error: unknown) => boolean
}

/** Firebase error codes worth another attempt. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'aborted',
  'cancelled',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'unavailable',
])

/** True when the failure may succeed if the write is tried again. */
export function isRetryableError(error: unknown): boolean {
  const code = firestoreErrorCode(error)
  return code !== null && RETRYABLE_CODES.has(code)
}

/**
 * Delay before retry number `attempt` (1-based).
 *
 * Doubles each time and clamps at `maxDelayMs`: 250, 500, 1000, 2000, 2000…
 */
export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  if (!Number.isFinite(attempt) || attempt < 1) return policy.baseDelayMs
  const raw = policy.baseDelayMs * 2 ** (attempt - 1)
  if (!Number.isFinite(raw)) return policy.maxDelayMs
  return Math.min(raw, policy.maxDelayMs)
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Runs `operation`, retrying transient failures with exponential backoff.
 *
 * Resolves with the operation's value or rethrows the last error. A
 * non-retryable error is thrown immediately, without a delay.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const policy: RetryPolicy = {
    attempts: Math.max(1, Math.trunc(options.attempts ?? DEFAULT_RETRY_POLICY.attempts)),
    baseDelayMs: Math.max(0, options.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs),
    maxDelayMs: Math.max(0, options.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs),
  }
  const sleep = options.sleep ?? defaultSleep
  const isRetryable = options.isRetryable ?? isRetryableError

  let lastError: unknown
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= policy.attempts || !isRetryable(error)) {
        throw error
      }
      await sleep(backoffDelay(attempt, policy))
    }
  }

  // Unreachable: the loop either returns or throws. Kept for the type checker.
  throw lastError
}
