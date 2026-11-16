/**
 * Sorting and filtering the expense list (PRD "expense list").
 *
 * Kept pure and separate from the panel so the order and the filter rules are
 * unit-tested instead of being an accident of JSX. Every sort ends on the
 * expense id, which makes the order total: two expenses with the same date and
 * amount never swap places between renders.
 */

import type { Expense } from './firestore'

export type ExpenseSort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'title-asc'

export const EXPENSE_SORT_LABELS: Record<ExpenseSort, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'amount-desc': 'Largest amount',
  'amount-asc': 'Smallest amount',
  'title-asc': 'Title A–Z',
}

export interface ExpenseFilter {
  /** Case-insensitive text matched against the title and the category. */
  text?: string | null
  /** Exact category match; `null`/empty means every category. */
  category?: string | null
  /** Exact payer id; `null`/empty means every payer. */
  payerId?: string | null
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  from?: string | null
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  to?: string | null
}

const EMPTY_FILTER: ExpenseFilter = {}

/** True when the expense passes every non-empty condition in `filter`. */
export function matchesExpenseFilter(expense: Expense, filter: ExpenseFilter): boolean {
  const text = filter.text?.trim().toLowerCase()
  if (text) {
    const haystack = `${expense.title}\n${expense.category}`.toLowerCase()
    if (!haystack.includes(text)) return false
  }
  if (filter.category && expense.category !== filter.category) return false
  if (filter.payerId && expense.payerId !== filter.payerId) return false
  if (filter.from && expense.date < filter.from) return false
  if (filter.to && expense.date > filter.to) return false
  return true
}

/** The expenses that pass the filter, in their original order. */
export function filterExpenses(
  expenses: readonly Expense[],
  filter: ExpenseFilter = EMPTY_FILTER,
): Expense[] {
  return expenses.filter((expense) => matchesExpenseFilter(expense, filter))
}

function byId(left: Expense, right: Expense): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function byTitle(left: Expense, right: Expense): number {
  const a = left.title.toLowerCase()
  const b = right.title.toLowerCase()
  if (a !== b) return a < b ? -1 : 1
  return byId(left, right)
}

const COMPARATORS: Record<ExpenseSort, (left: Expense, right: Expense) => number> = {
  'date-desc': (left, right) => {
    if (left.date !== right.date) return left.date < right.date ? 1 : -1
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt
    return byId(left, right)
  },
  'date-asc': (left, right) => {
    if (left.date !== right.date) return left.date < right.date ? -1 : 1
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
    return byId(left, right)
  },
  'amount-desc': (left, right) => {
    if (left.totalPaise !== right.totalPaise) return right.totalPaise - left.totalPaise
    return COMPARATORS['date-desc'](left, right)
  },
  'amount-asc': (left, right) => {
    if (left.totalPaise !== right.totalPaise) return left.totalPaise - right.totalPaise
    return COMPARATORS['date-asc'](left, right)
  },
  'title-asc': byTitle,
}

/** A new array sorted by `sort`; the input is never mutated. */
export function sortExpenses(expenses: readonly Expense[], sort: ExpenseSort): Expense[] {
  return [...expenses].sort(COMPARATORS[sort])
}

/** Filter then sort, the order the list actually renders in. */
export function viewExpenses(
  expenses: readonly Expense[],
  filter: ExpenseFilter = EMPTY_FILTER,
  sort: ExpenseSort = 'date-desc',
): Expense[] {
  return sortExpenses(filterExpenses(expenses, filter), sort)
}

/** The distinct categories already used, sorted, for free-text suggestions. */
export function expenseCategories(expenses: readonly Expense[]): string[] {
  // Deduplicate case-insensitively so "Food" and "food" are one suggestion,
  // keeping the first spelling seen. The stored text is never rewritten.
  const seen = new Map<string, string>()
  for (const expense of expenses) {
    const key = expense.category.toLowerCase()
    if (!seen.has(key)) seen.set(key, expense.category)
  }
  return [...seen.values()].sort((left, right) => {
    const a = left.toLowerCase()
    const b = right.toLowerCase()
    return a === b ? 0 : a < b ? -1 : 1
  })
}
