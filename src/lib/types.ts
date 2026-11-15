/** A single personal expense entry. */
export interface Expense {
  id: string
  description: string
  amount: number
  category: ExpenseCategory
  date: string
  createdAt: number
}

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Housing',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** The subset of fields a user supplies when creating an expense. */
export type NewExpense = Omit<Expense, 'id' | 'createdAt'>
