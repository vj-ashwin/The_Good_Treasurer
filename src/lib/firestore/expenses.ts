/**
 * Expense reads and writes.
 *
 * Every expense write is one atomic batch of exactly two documents: the
 * expense and the history entry that describes the write (docs/FIRESTORE.md
 * §3). The rules reject an expense write whose `lastHistoryId` does not exist,
 * so this module cannot forget the audit half.
 *
 * The money arithmetic is not here. `prepareExpense` only validates the fields
 * the organiser typed and delegates the split to `src/lib/money/expense.ts`,
 * which is pure and property-tested.
 */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  finalizeExpense,
  type GstParts,
  type LineItemInput,
  type SplitMode,
  type StoredLineItem,
} from '../money'
import { newId } from './ids'
import { commitOnce } from './idempotency'
import {
  parseExpense,
  requireNotFutureDate,
  requireParticipants,
  requireText,
  CATEGORY_MAX,
  EXPENSE_TITLE_MAX,
  MAX_LINE_ITEMS,
  ValidationError,
  type Expense,
} from './models'
import { expensesPath, historyPath, requireUid } from './paths'
import { withRetry } from './retry'

/** What the expense form supplies. Money is already integer paise. */
export interface NewExpense {
  title: string
  /** `YYYY-MM-DD`. */
  date: string
  category: string
  payerId: string
  participants: readonly string[]
  mode: SplitMode
  baseAmountPaise: number
  gstBps?: number | null
  scBps?: number | null
  /**
   * Fixed GST in paise (PRD G3 rupee entry). When set, it replaces `gstBps`.
   * Rejected for `itemized`, which taxes each line at a rate.
   */
  gstAmountPaise?: number | null
  /** Fixed service charge in paise. When set, it replaces `scBps`. */
  scAmountPaise?: number | null
  /** Optional CGST/SGST/IGST split of `gstAmountPaise`. */
  gstParts?: GstParts | null
  /** Required for `exact`. */
  exactShares?: Readonly<Record<string, number>>
  /** Required for `itemized`. */
  lineItems?: readonly LineItemInput[]
}

/** The stored fields minus the server-managed ones. */
export interface PreparedExpense {
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
  lineItems: StoredLineItem[] | null
  shares: Record<string, number>
}

export interface CreatedExpense {
  id: string
  historyId: string
  totalPaise: number
}

/**
 * A write was based on a version of the expense that has since changed.
 *
 * The dialog catches this, shows the cloud copy, and offers "keep mine" or
 * "keep the saved copy" (PRD G7 / CUJ 8 / OQ4). `cloudExpense` is the version
 * now on the server.
 */
export class ExpenseConflictError extends Error {
  readonly cloudExpense: Expense
  readonly expectedUpdatedAt: number

  constructor(cloudExpense: Expense, expectedUpdatedAt: number) {
    super('This expense was changed elsewhere. Choose which version to keep.')
    this.name = 'ExpenseConflictError'
    this.cloudExpense = cloudExpense
    this.expectedUpdatedAt = expectedUpdatedAt
  }
}

function requireRate(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new ValidationError(`${label} must be between 0% and 100%.`)
  }
  return value
}

/** A fixed rupee amount in paise; `null` means "not entered". */
function requireFixedPaise(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be zero or more, in paise.`)
  }
  return value
}

/**
 * Validates the form fields and resolves the split.
 *
 * Pure and synchronous, so the dialog can call it for its live preview and the
 * writer can call it again for the write without the two drifting apart.
 */
export function prepareExpense(input: NewExpense): PreparedExpense {
  const title = requireText(input.title, EXPENSE_TITLE_MAX, 'Expense title')
  const category = requireText(input.category, CATEGORY_MAX, 'Category')
  const date = requireNotFutureDate(input.date)
  const participants = requireParticipants(input.participants)

  if (!participants.includes(input.payerId)) {
    throw new ValidationError('The payer must be one of the participants.')
  }

  if (!Number.isSafeInteger(input.baseAmountPaise) || input.baseAmountPaise <= 0) {
    throw new ValidationError('Amount must be greater than zero, in paise.')
  }

  const fixedGst = requireFixedPaise(input.gstAmountPaise, 'GST amount')
  const fixedSc = requireFixedPaise(input.scAmountPaise, 'Service charge amount')
  // A fixed amount is the entry mode; store no rate so re-opening the form and
  // the report agree on how the tax was entered.
  const gstBps = fixedGst === null ? requireRate(input.gstBps, 'GST') : null
  const scBps = fixedSc === null ? requireRate(input.scBps, 'Service charge') : null

  if (input.lineItems && input.lineItems.length > MAX_LINE_ITEMS) {
    throw new ValidationError(`A bill can have at most ${String(MAX_LINE_ITEMS)} line items.`)
  }

  let finalized
  try {
    finalized = finalizeExpense({
      mode: input.mode,
      baseAmountPaise: input.baseAmountPaise,
      gstBps,
      scBps,
      gstAmountPaise: fixedGst,
      scAmountPaise: fixedSc,
      gstParts: input.gstParts,
      participantIds: participants,
      exactShares: input.exactShares,
      lineItems: input.lineItems,
    })
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : 'The split could not be calculated.',
    )
  }

  return {
    title,
    date,
    category,
    payerId: input.payerId,
    participants,
    baseAmountPaise: finalized.basePaise,
    gstAmountPaise: finalized.gstPaise,
    serviceChargeAmountPaise: finalized.serviceChargePaise,
    totalPaise: finalized.totalPaise,
    gstBps,
    serviceChargeBps: scBps,
    gstParts: finalized.gstParts,
    lineItems: finalized.lineItems,
    shares: finalized.shares,
  }
}

/**
 * Writes the expense and its `create` history entry in one batch.
 *
 * A retry after a lost response is confirmed rather than reported as a
 * failure, so the organiser never sees an error for a write that succeeded.
 */
export async function createExpense(
  db: Firestore,
  uid: string,
  tripId: string,
  input: NewExpense,
): Promise<CreatedExpense> {
  const owner = requireUid(uid)
  const prepared = prepareExpense(input)

  const expenseId = newId()
  const historyId = newId()
  const expenseRef = doc(db, expensesPath(owner, tripId), expenseId)
  const historyRef = doc(db, historyPath(owner, tripId), historyId)

  // The batch is rebuilt on every attempt so a retry starts from a clean slate;
  // the ids above keep the logical write the same.
  await withRetry(async () => {
    const batch = writeBatch(db)
    batch.set(expenseRef, {
      ...prepared,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null,
      lastHistoryId: historyId,
    })
    batch.set(historyRef, {
      expenseId,
      action: 'create',
      authorId: owner,
      timestamp: serverTimestamp(),
      changedFields: [],
      before: null,
      // A full snapshot of what was recorded. The read path needs it to show the
      // create milestone without re-deriving anything from the live document.
      after: { ...prepared },
    })

    await commitOnce(batch, async () => {
      const existing = await getDoc(expenseRef)
      return existing.exists() ? { id: expenseId, historyId, totalPaise: prepared.totalPaise } : null
    })
  })

  return { id: expenseId, historyId, totalPaise: prepared.totalPaise }
}

/** The fields an edit is allowed to change, and therefore record in history. */
const EDITABLE_FIELDS = [
  'title',
  'date',
  'category',
  'payerId',
  'participants',
  'baseAmountPaise',
  'gstAmountPaise',
  'serviceChargeAmountPaise',
  'totalPaise',
  'gstBps',
  'serviceChargeBps',
  'gstParts',
  'lineItems',
  'shares',
] as const

/** Structural equality for the JSON-shaped values an expense stores. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
    )
  }
  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) =>
      sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  }
  return false
}

interface ExpenseDiff {
  changedFields: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
}

/**
 * The fields that actually changed, with matching `before`/`after` snapshots.
 *
 * The rules require the snapshots' keys to equal `changedFields` exactly, so
 * both maps are built in the same loop rather than filtered afterwards.
 */
function diffExpense(before: Expense, after: PreparedExpense): ExpenseDiff {
  const changedFields: string[] = []
  const beforeSnapshot: Record<string, unknown> = {}
  const afterSnapshot: Record<string, unknown> = {}

  for (const field of EDITABLE_FIELDS) {
    const oldValue = (before as unknown as Record<string, unknown>)[field]
    const newValue = (after as unknown as Record<string, unknown>)[field] ?? null
    if (!sameValue(oldValue, newValue)) {
      changedFields.push(field)
      beforeSnapshot[field] = oldValue
      afterSnapshot[field] = newValue
    }
  }

  return { changedFields, before: beforeSnapshot, after: afterSnapshot }
}

export interface UpdateExpenseOptions {
  /**
   * The `updatedAt` the form was opened with. When it no longer matches the
   * stored document, the write is rejected with `ExpenseConflictError`.
   * Omit (or pass `null`) to skip the check.
   */
  expectedUpdatedAt?: number | null
  /** Keep mine: skip the conflict check and overwrite the stored copy. */
  force?: boolean
}

/**
 * Replaces an expense's editable fields and records the `update` entry.
 *
 * PRD G4/CUJ 6. The change is one batch containing the new document and a
 * history entry whose `before`/`after` snapshots hold only the changed fields,
 * which is exactly what the rules verify.
 */
export async function updateExpense(
  db: Firestore,
  uid: string,
  tripId: string,
  expenseId: string,
  input: NewExpense,
  options: UpdateExpenseOptions = {},
): Promise<void> {
  const owner = requireUid(uid)
  const expenseRef = doc(db, expensesPath(owner, tripId), expenseId)

  const existing = await withRetry(() => getDoc(expenseRef))
  if (!existing.exists()) {
    throw new ValidationError('That expense no longer exists.')
  }
  const current = parseExpense(expenseId, tripId, existing.data({ serverTimestamps: 'estimate' }))
  if (current.deletedAt !== null) {
    throw new ValidationError('Restore that expense before editing it.')
  }

  if (
    options.force !== true &&
    options.expectedUpdatedAt != null &&
    current.updatedAt !== options.expectedUpdatedAt
  ) {
    throw new ExpenseConflictError(current, options.expectedUpdatedAt)
  }

  const prepared = prepareExpense(input)
  const diff = diffExpense(current, prepared)
  if (diff.changedFields.length === 0) {
    throw new ValidationError('No changes to save.')
  }

  const historyId = newId()
  const historyRef = doc(db, historyPath(owner, tripId), historyId)

  await withRetry(async () => {
    const batch = writeBatch(db)
    // `createdAt` and `deletedAt` are deliberately untouched: the rules pin the
    // former and only the delete/restore flows may move the latter.
    batch.update(expenseRef, {
      ...prepared,
      updatedAt: serverTimestamp(),
      lastHistoryId: historyId,
    })
    batch.set(historyRef, {
      expenseId,
      action: 'update',
      authorId: owner,
      timestamp: serverTimestamp(),
      changedFields: diff.changedFields,
      before: diff.before,
      after: diff.after,
    })

    await commitOnce(batch, async () => {
      // The new `lastHistoryId` is the marker this write landed. Checking it is
      // safe while offline too, because the local cache already holds the write.
      const landed = await getDoc(expenseRef)
      return landed.exists() && landed.data()?.lastHistoryId === historyId ? true : null
    })
  })
}

/**
 * Soft-deletes an expense and records the `delete` entry in one batch.
 *
 * A deleted expense is frozen by the rules: it cannot be edited or deleted
 * again until it is restored (firestore.rules, `allow update`). Refusing here
 * turns that rule into a friendly message instead of a permission failure.
 */
export async function softDeleteExpense(
  db: Firestore,
  uid: string,
  tripId: string,
  expenseId: string,
): Promise<void> {
  const owner = requireUid(uid)
  const expenseRef = doc(db, expensesPath(owner, tripId), expenseId)

  const existing = await withRetry(() => getDoc(expenseRef))
  if (!existing.exists()) {
    throw new ValidationError('That expense no longer exists.')
  }
  if (existing.data()?.deletedAt != null) {
    throw new ValidationError('That expense is already deleted.')
  }

  const historyId = newId()
  await withRetry(async () => {
    const batch = writeBatch(db)
    batch.update(expenseRef, {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastHistoryId: historyId,
    })
    batch.set(doc(db, historyPath(owner, tripId), historyId), {
      expenseId,
      action: 'delete',
      authorId: owner,
      timestamp: serverTimestamp(),
      changedFields: ['deletedAt'],
      before: { deletedAt: null },
      after: { deletedAt: serverTimestamp() },
    })

    await commitOnce(batch, async () => {
      // A lost response means the delete already landed. Confirm from the live
      // document rather than reporting a failure that would invite a retry.
      const current = await getDoc(expenseRef)
      return current.exists() && current.data()?.deletedAt != null ? true : null
    })
  })
}

/**
 * Restores a soft-deleted expense and records the `restore` entry in one batch.
 *
 * `deletedAt` goes back to `null`, which is the only value the rules accept
 * besides the exact server time of a fresh delete.
 */
export async function restoreExpense(
  db: Firestore,
  uid: string,
  tripId: string,
  expenseId: string,
): Promise<void> {
  const owner = requireUid(uid)
  const expenseRef = doc(db, expensesPath(owner, tripId), expenseId)

  const existing = await withRetry(() => getDoc(expenseRef))
  if (!existing.exists()) {
    throw new ValidationError('That expense no longer exists.')
  }
  const deletedAt = existing.data()?.deletedAt ?? null
  if (deletedAt === null) {
    throw new ValidationError('That expense is not deleted.')
  }

  const historyId = newId()
  await withRetry(async () => {
    const batch = writeBatch(db)
    batch.update(expenseRef, {
      deletedAt: null,
      updatedAt: serverTimestamp(),
      lastHistoryId: historyId,
    })
    batch.set(doc(db, historyPath(owner, tripId), historyId), {
      expenseId,
      action: 'restore',
      authorId: owner,
      timestamp: serverTimestamp(),
      changedFields: ['deletedAt'],
      before: { deletedAt },
      after: { deletedAt: null },
    })

    await commitOnce(batch, async () => {
      const current = await getDoc(expenseRef)
      return current.exists() && current.data()?.deletedAt == null ? true : null
    })
  })
}

/** Newest expense day first, then newest write, then id for a stable order. */
function compareExpenses(left: Expense, right: Expense): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1
  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Subscribes to every expense in one trip, including soft-deleted ones.
 *
 * Deleted expenses are returned so history and restore can show them; readers
 * that compute a total filter on `deletedAt` themselves.
 */
export function watchExpenses(
  db: Firestore,
  uid: string,
  tripId: string,
  onExpenses: (expenses: Expense[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, expensesPath(uid, tripId)),
    {
      next: (snapshot) => {
        try {
          const expenses = snapshot.docs
            .map((document) =>
              parseExpense(
                document.id,
                tripId,
                document.data({ serverTimestamps: 'estimate' }),
              ),
            )
            .sort(compareExpenses)
          onExpenses(expenses)
        } catch (error) {
          // Corrupt data goes down the error channel rather than escaping the
          // SDK callback as an unhandled exception.
          onError(error)
        }
      },
      error: onError,
    },
  )
}
