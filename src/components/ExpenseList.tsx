import type { Expense } from '../lib/types'
import { formatCurrency, formatDate } from '../lib/format'
import { TrashIcon } from './icons'

interface ExpenseListProps {
  expenses: Expense[]
  onDelete: (expenseId: string) => void
  deletingId: string | null
}

export default function ExpenseList({ expenses, onDelete, deletingId }: ExpenseListProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Your expenses</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {expenses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No expenses recorded yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add your first expense using the form to start tracking your spending.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{expense.description}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                    {expense.category}
                  </span>
                  <span>{formatDate(expense.date)}</span>
                </p>
              </div>

              <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {formatCurrency(expense.amount)}
              </p>

              <button
                type="button"
                onClick={() => onDelete(expense.id)}
                disabled={deletingId === expense.id}
                aria-label={`Delete ${expense.description}`}
                className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:ring-2 focus:ring-red-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
