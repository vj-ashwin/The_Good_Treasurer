/**
 * Changelog reads.
 *
 * History is append-only: this module deliberately offers no write path.
 * Entries are written by the expense service, in the same batch as the expense
 * write they describe (docs/FIRESTORE.md §3), and the rules reject any attempt
 * to rewrite or erase one.
 */

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { parseHistoryEntry, type HistoryEntry } from './models'
import { historyPath } from './paths'

/**
 * Subscribes to one trip's changelog, newest first.
 *
 * A single-field `timestamp` index is created automatically, so this needs no
 * composite index. Pending server timestamps read as `0`; the UI sorts those
 * last rather than inventing a time.
 */
export function watchHistory(
  db: Firestore,
  uid: string,
  tripId: string,
  onHistory: (entries: HistoryEntry[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, historyPath(uid, tripId)), orderBy('timestamp', 'desc')),
    {
      next: (snapshot) => {
        try {
          onHistory(
            snapshot.docs.map((document) =>
              parseHistoryEntry(
                document.id,
                document.data({ serverTimestamps: 'estimate' }),
              ),
            ),
          )
        } catch (error) {
          // A malformed entry is corruption, not a rule rejection. Route it
          // through the same error channel as a listener failure.
          onError(error)
        }
      },
      error: onError,
    },
  )
}
