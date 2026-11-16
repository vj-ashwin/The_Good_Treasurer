/**
 * One retry cannot duplicate a write.
 *
 * A write that reached the server but whose response was lost is already
 * committed. Retrying with the same document id is then rejected, because the
 * rules pin `createdAt`/`updatedAt` and a fresh server timestamp no longer
 * matches. Before surfacing that rejection as a failure, the caller checks
 * whether the document it was trying to write is actually there: if it is, the
 * original attempt succeeded and the retry is a no-op.
 *
 * The check only runs after a failure, so the happy path costs no extra read.
 */

import type { WriteBatch } from 'firebase/firestore'

/**
 * Commits `batch`, or confirms an earlier attempt already landed.
 *
 * Returns `null` when this call did the commit, or the value `confirm()`
 * produced when the write was already applied. Throws the original error when
 * neither is true.
 */
export async function commitOnce<T>(
  batch: WriteBatch,
  confirm: () => Promise<T>,
): Promise<T | null> {
  try {
    await batch.commit()
    return null
  } catch (error) {
    const alreadyApplied = await confirm()
    if (alreadyApplied !== null) return alreadyApplied
    throw error
  }
}
