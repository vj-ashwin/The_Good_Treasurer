import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Expense, ExpenseCategory, NewExpense } from './types'
import { EXPENSE_CATEGORIES } from './types'

/**
 * Expenses live in a subcollection of the user's own document, so Firestore
 * rules can scope every read/write to `users/{uid}` with a simple path check.
 */
export function expensesCollection(uid: string): CollectionReference<DocumentData> {
  return collection(db, 'users', uid, 'expenses')
}

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value === 'number') return value
  return 0
}

function toCategory(value: unknown): ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory)
    ? (value as ExpenseCategory)
    : 'Other'
}

function toExpense(snapshot: QueryDocumentSnapshot<DocumentData>): Expense {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    description: typeof data.description === 'string' ? data.description : '',
    amount: typeof data.amount === 'number' ? data.amount : 0,
    category: toCategory(data.category),
    date: typeof data.date === 'string' ? data.date : '',
    createdAt: toMillis(data.createdAt),
  }
}

/**
 * Streams the user's expenses in real time. The list is sorted client-side so
 * the query never needs a composite Firestore index.
 */
export function subscribeToExpenses(
  uid: string,
  onChange: (expenses: Expense[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    expensesCollection(uid),
    (snapshot) => {
      const expenses = snapshot.docs.map(toExpense)
      expenses.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return b.createdAt - a.createdAt
      })
      onChange(expenses)
    },
    (error) => onError(error),
  )
}

export async function addExpense(uid: string, expense: NewExpense): Promise<void> {
  await addDoc(expensesCollection(uid), {
    ...expense,
    createdAt: serverTimestamp(),
  })
}

export async function deleteExpense(uid: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'expenses', expenseId))
}
