/**
 * Public surface of the Firestore layer.
 *
 * All functions take the `Firestore` instance explicitly; `src/lib/firebase.ts`
 * owns the configured, persistently cached instance the app passes in.
 */

export { createTrip, createTripWithPeople, getTrip, watchTrips } from './trips'
export type { CreatedTrip, NewTrip } from './trips'
export { addPerson, watchPeople, deletePerson, personIsReferenced } from './people'
export type { CreatedPerson, NewPerson } from './people'
export {
  createExpense,
  ExpenseConflictError,
  prepareExpense,
  restoreExpense,
  softDeleteExpense,
  updateExpense,
  watchExpenses,
} from './expenses'
export type {
  CreatedExpense,
  NewExpense,
  PreparedExpense,
  UpdateExpenseOptions,
} from './expenses'
export { watchHistory } from './history'
export {
  parseExpense,
  parseHistoryEntry,
  parsePerson,
  parseTrip,
  requireCalendarDate,
  requireName,
  requireNotFutureDate,
  requireParticipants,
  requireText,
  CATEGORY_MAX,
  EXPENSE_TITLE_MAX,
  MAX_HISTORY_FIELDS,
  MAX_LINE_ITEMS,
  MAX_PARTICIPANTS,
  PERSON_NAME_MAX,
  TRIP_NAME_MAX,
  DataError,
  ValidationError,
} from './models'
export type { Expense, HistoryAction, HistoryEntry, Person, Trip } from './models'
export { isUuid, newId } from './ids'
export { describeError, describeFirestoreError, firestoreErrorCode, isOfflineError } from './errors'
export { backoffDelay, isRetryableError, withRetry } from './retry'
export type { RetryOptions, RetryPolicy } from './retry'
