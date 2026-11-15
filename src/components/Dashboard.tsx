import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import ExpenseForm from './ExpenseForm'
import ExpenseList from './ExpenseList'
import { BrandMark, LogoutIcon } from './icons'
import { addExpense, deleteExpense, subscribeToExpenses } from '../lib/expenses'
import { formatCurrency, currentMonthWindow, isInMonth } from '../lib/format'
import type { Expense, NewExpense } from '../lib/types'

interface DashboardProps {
  user: User
  onSignOut: () => void
}

export default function Dashboard({ user, onSignOut }: DashboardProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToExpenses(
      user.uid,
      (nextExpenses) => {
        setExpenses(nextExpenses)
        setLoading(false)
        setError(null)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [user.uid])

  const { total, monthTotal, monthLabel } = useMemo(() => {
    const window = currentMonthWindow()
    let sum = 0
    let monthSum = 0
    for (const expense of expenses) {
      sum += expense.amount
      if (isInMonth(expense.date, window.year, window.month)) {
        monthSum += expense.amount
      }
    }
    return { total: sum, monthTotal: monthSum, monthLabel: window.label }
  }, [expenses])

  const handleAdd = async (expense: NewExpense) => {
    await addExpense(user.uid, expense)
  }

  const handleDelete = async (expenseId: string) => {
    setDeletingId(expenseId)
    try {
      await deleteExpense(user.uid, expenseId)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Could not delete that expense.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  const displayName = user.displayName || user.email || 'Treasurer'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <div>
              <p className="text-base font-semibold tracking-tight text-slate-900">
                The Good Treasurer
              </p>
              <p className="text-xs text-slate-500">Personal expense ledger</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{displayName}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="h-9 w-9 rounded-full border border-slate-200"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total spent</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
              {formatCurrency(total)}
            </p>
            <p className="mt-1 text-xs text-slate-400">All recorded expenses</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">This month</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-brand-600">
              {formatCurrency(monthTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-400">{monthLabel}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Expenses</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
              {expenses.length}
            </p>
            <p className="mt-1 text-xs text-slate-400">Entries in your ledger</p>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <ExpenseForm onAdd={handleAdd} />
          </div>
          <div className="lg:col-span-3">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Loading your expenses…</p>
              </div>
            ) : (
              <ExpenseList
                expenses={expenses}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
