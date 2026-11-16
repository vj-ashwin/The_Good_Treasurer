import { useEffect, useRef, useState, type FormEvent } from 'react'
import { db } from '../lib/firebase'
import { formatDate, todayIso } from '../lib/format'
import {
  createExpense,
  describeError,
  ExpenseConflictError,
  prepareExpense,
  restoreExpense,
  softDeleteExpense,
  updateExpense,
  type Expense,
  type NewExpense,
  type Person,
  type PreparedExpense,
} from '../lib/firestore'
import { expenseToInput, type TaxMode } from '../lib/expenseInput'
import {
  EXPENSE_SORT_LABELS,
  expenseCategories,
  viewExpenses,
  type ExpenseFilter,
  type ExpenseSort,
} from '../lib/expenseView'
import {
  billTotals,
  formatPaise,
  parsePaise,
  parsePercentToBps,
  type GstParts,
  type LineItemInput,
  type SplitMode,
} from '../lib/money'
import ErrorNotice from './ErrorNotice'
import { CloseIcon, PlusIcon, ReceiptIcon } from './icons'

/** Suggestions only: the category is free text (PRD "expense categories"). */
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Stay', 'Shopping', 'Activities', 'Other'] as const

function rupee(paise: number): string {
  return formatPaise(paise)
}

/**
 * An integer-paise amount as an editable rupee string, e.g. `120050` → `"1200.50"`.
 *
 * String slicing keeps the conversion exact; the amount never passes through a
 * float on its way into the form.
 */
function paiseToInput(paise: number): string {
  const digits = String(paise).padStart(3, '0')
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/** A rate in basis points as a percent string, e.g. `1850` → `"18.50"`. */
function bpsToPercentInput(bps: number): string {
  const digits = String(bps).padStart(3, '0')
  const whole = digits.slice(0, -2)
  const fraction = digits.slice(-2)
  return fraction === '00' ? whole : `${whole}.${fraction}`
}

/** A parsed optional percentage: blank falls back to the bill-level rate. */
function parseOptionalPercent(value: string): number | null | 'invalid' {
  if (value.trim() === '') return null
  const bps = parsePercentToBps(value)
  return bps === null ? 'invalid' : bps
}

function taxModeOf(rate: number | null | undefined, fixedPaise: number | null | undefined): TaxMode {
  if (rate !== null && rate !== undefined) return 'percent'
  if (fixedPaise !== null && fixedPaise !== undefined && fixedPaise > 0) return 'fixed'
  return 'none'
}

export default function ExpensesPanel({
  uid,
  tripId,
  people,
  expenses,
  loading,
  error,
}: {
  uid: string
  tripId: string
  people: Person[]
  /** The trip page owns the single expense subscription and passes it down. */
  expenses: Expense[]
  loading: boolean
  error: string | null
}) {
  const [dialog, setDialog] = useState<{ expense: Expense | null } | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [sort, setSort] = useState<ExpenseSort>('date-desc')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [payerFilter, setPayerFilter] = useState('')

  const liveCount = expenses.filter((expense) => expense.deletedAt === null).length
  const categories = expenseCategories(expenses)

  const filter: ExpenseFilter = {
    text: search,
    category: categoryFilter,
    payerId: payerFilter,
  }
  const filtered = viewExpenses(expenses, filter, sort)
  const filtersActive =
    search.trim() !== '' || categoryFilter !== '' || payerFilter !== '' || sort !== 'date-desc'

  async function handleTransition(expense: Expense) {
    setPendingId(expense.id)
    setActionError(null)
    try {
      if (expense.deletedAt === null) {
        await softDeleteExpense(db, uid, tripId, expense.id)
      } else {
        await restoreExpense(db, uid, tripId, expense.id)
      }
    } catch (failure) {
      setActionError(describeError(failure))
    } finally {
      setPendingId(null)
    }
  }

  function clearFilters() {
    setSearch('')
    setCategoryFilter('')
    setPayerFilter('')
    setSort('date-desc')
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Expenses</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Record what was paid and how it is split, in paise.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialog({ expense: null })}
            disabled={people.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add expense
          </button>
        </div>
        {people.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Add people to this trip before recording an expense.
          </p>
        ) : null}
      </section>

      {error ? <ErrorNotice message={error} /> : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : null}

      {!loading && expenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <ReceiptIcon className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">No expenses yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Expenses recorded for this trip will appear here with their split.
          </p>
        </div>
      ) : null}

      {!loading && expenses.length > 0 ? (
        <p className="text-xs text-slate-500">
          {liveCount} live expense{liveCount === 1 ? '' : 's'}
          {expenses.length > liveCount
            ? ` · ${String(expenses.length - liveCount)} deleted (restore from here or History)`
            : ''}
          {filtered.length !== expenses.length
            ? ` · showing ${String(filtered.length)} of ${String(expenses.length)}`
            : ''}
        </p>
      ) : null}

      {expenses.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium text-slate-600">
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title or category"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as ExpenseSort)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                {(Object.keys(EXPENSE_SORT_LABELS) as ExpenseSort[]).map((value) => (
                  <option key={value} value={value}>
                    {EXPENSE_SORT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                <option value="">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Paid by
              <select
                value={payerFilter}
                onChange={(event) => setPayerFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                <option value="">Anyone</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              Clear search, filters and sort
            </button>
          ) : null}
        </section>
      ) : null}

      {expenses.length > 0 && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No expenses match these filters</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Clear them
          </button>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <ExpenseList
          expenses={filtered}
          people={people}
          pendingId={pendingId}
          onTransition={(expense) => void handleTransition(expense)}
          onEdit={(expense) => setDialog({ expense })}
        />
      ) : null}

      {dialog ? (
        <ExpenseDialog
          key={dialog.expense?.id ?? 'new'}
          uid={uid}
          tripId={tripId}
          people={people}
          expense={dialog.expense}
          suggestions={categories}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

function personName(people: Person[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? 'Unknown person'
}

function ExpenseList({
  expenses,
  people,
  pendingId,
  onTransition,
  onEdit,
}: {
  expenses: Expense[]
  people: Person[]
  pendingId: string | null
  onTransition: (expense: Expense) => void
  onEdit: (expense: Expense) => void
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {expenses.map((expense) => {
        const deleted = expense.deletedAt !== null
        const busy = pendingId === expense.id
        return (
          <li key={expense.id} className={`px-5 py-4 ${deleted ? 'bg-slate-50' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm font-semibold ${
                    deleted ? 'text-slate-500 line-through' : 'text-slate-900'
                  }`}
                >
                  {expense.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(expense.date)} · {expense.category} · Paid by{' '}
                  {personName(people, expense.payerId)}
                </p>
                {deleted ? (
                  <span className="mt-1.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Deleted
                  </span>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${deleted ? 'text-slate-500' : 'text-slate-900'}`}>
                  {rupee(expense.totalPaise)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {expense.participants.length} participant(s)
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  {deleted ? null : (
                    <button
                      type="button"
                      onClick={() => onEdit(expense)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onTransition(expense)}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? 'Working…' : deleted ? 'Restore' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
            {expense.gstAmountPaise > 0 || expense.serviceChargeAmountPaise > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Base {rupee(expense.baseAmountPaise)}
                {expense.gstAmountPaise > 0 ? ` · GST ${rupee(expense.gstAmountPaise)}` : ''}
                {expense.serviceChargeAmountPaise > 0
                  ? ` · Service ${rupee(expense.serviceChargeAmountPaise)}`
                  : ''}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

interface LineDraft {
  description: string
  amount: string
  consumerIds: string[]
  /** Blank means "use the bill-level rate". */
  gstPercent: string
  scPercent: string
}

interface FormState {
  title: string
  date: string
  category: string
  payerId: string
  mode: SplitMode
  amount: string
  gstMode: TaxMode
  gstPercent: string
  gstAmount: string
  cgst: string
  sgst: string
  igst: string
  scMode: TaxMode
  scPercent: string
  scAmount: string
  selectedIds: string[]
  exactAmounts: Record<string, string>
  lines: LineDraft[]
}

type Preview =
  | { ok: true; prepared: PreparedExpense; input: NewExpense }
  | { ok: false; message: string }

function blankForm(people: Person[]): FormState {
  const allIds = people.map((person) => person.id)
  return {
    title: '',
    date: todayIso(),
    category: DEFAULT_CATEGORIES[0],
    payerId: people[0]?.id ?? '',
    mode: 'equal',
    amount: '',
    gstMode: 'none',
    gstPercent: '',
    gstAmount: '',
    cgst: '',
    sgst: '',
    igst: '',
    scMode: 'none',
    scPercent: '',
    scAmount: '',
    selectedIds: allIds,
    exactAmounts: {},
    lines: [{ description: '', amount: '', consumerIds: allIds, gstPercent: '', scPercent: '' }],
  }
}

/** Reopens a stored expense on the tabs and values that reproduce it exactly. */
function formFromInput(input: NewExpense, people: Person[]): FormState {
  const identifiers = new Set(people.map((person) => person.id))
  const billGst = input.gstBps ?? 0
  const billSc = input.scBps ?? 0
  const lines = (input.lineItems ?? []).map((line) => {
    const lineGst = line.gstBps ?? billGst
    const lineSc = line.scBps ?? billSc
    return {
      description: line.description,
      amount: paiseToInput(line.amountPaise),
      consumerIds: [...line.consumerIds].filter((id) => identifiers.has(id)),
      gstPercent: lineGst === billGst ? '' : bpsToPercentInput(lineGst),
      scPercent: lineSc === billSc ? '' : bpsToPercentInput(lineSc),
    }
  })

  const exactAmounts: Record<string, string> = {}
  for (const [id, share] of Object.entries(input.exactShares ?? {})) {
    exactAmounts[id] = paiseToInput(share)
  }

  const parts = input.gstParts ?? null

  return {
    title: input.title,
    date: input.date,
    category: input.category,
    payerId: input.payerId,
    mode: input.mode,
    amount: input.lineItems ? '' : paiseToInput(input.baseAmountPaise),
    gstMode: taxModeOf(input.gstBps, input.gstAmountPaise),
    gstPercent: input.gstBps !== null && input.gstBps !== undefined ? bpsToPercentInput(input.gstBps) : '',
    gstAmount:
      input.gstAmountPaise !== null && input.gstAmountPaise !== undefined
        ? paiseToInput(input.gstAmountPaise)
        : '',
    cgst: parts === null ? '' : paiseToInput(parts.cgstPaise),
    sgst: parts === null ? '' : paiseToInput(parts.sgstPaise),
    igst: parts === null ? '' : paiseToInput(parts.igstPaise),
    scMode: taxModeOf(input.scBps, input.scAmountPaise),
    scPercent: input.scBps !== null && input.scBps !== undefined ? bpsToPercentInput(input.scBps) : '',
    scAmount:
      input.scAmountPaise !== null && input.scAmountPaise !== undefined
        ? paiseToInput(input.scAmountPaise)
        : '',
    selectedIds: [...input.participants],
    exactAmounts,
    lines:
      lines.length > 0
        ? lines
        : [
            {
              description: '',
              amount: '',
              consumerIds: people.map((person) => person.id),
              gstPercent: '',
              scPercent: '',
            },
          ],
  }
}

function computePreview(form: FormState, people: Person[]): Preview {
  const identifiers = new Set(people.map((person) => person.id))
  const payerId = identifiers.has(form.payerId) ? form.payerId : (people[0]?.id ?? '')

  if (!form.title.trim()) return { ok: false, message: 'Enter a title.' }
  if (!form.date) return { ok: false, message: 'Choose a date.' }
  if (!form.category.trim()) return { ok: false, message: 'Enter a category.' }
  if (!payerId) return { ok: false, message: 'Choose who paid.' }

  const selected = form.selectedIds.filter((id) => identifiers.has(id))
  const participants = form.mode === 'itemized' ? people.map((person) => person.id) : selected
  if (participants.length === 0) {
    return { ok: false, message: 'Choose at least one participant.' }
  }
  if (!participants.includes(payerId)) {
    return { ok: false, message: 'The payer must be included as a participant.' }
  }

  // Itemized bills tax each line at a rate, so a fixed bill-level amount is not
  // offered. Treat a stale "fixed" selection as no tax rather than writing one.
  const gstMode = form.mode === 'itemized' && form.gstMode === 'fixed' ? 'none' : form.gstMode
  const scMode = form.mode === 'itemized' && form.scMode === 'fixed' ? 'none' : form.scMode

  let gstBps: number | null = null
  let gstAmountPaise: number | null = null
  let gstParts: GstParts | null = null
  if (gstMode === 'percent') {
    const value = parsePercentToBps(form.gstPercent)
    if (value === null) {
      return { ok: false, message: 'GST must be a percentage from 0 to 100.' }
    }
    gstBps = value
  } else if (gstMode === 'fixed') {
    const value = parsePaise(form.gstAmount)
    if (value === null) {
      return { ok: false, message: 'Enter the GST amount read from the bill.' }
    }
    gstAmountPaise = value

    const partsTouched =
      form.cgst.trim() !== '' || form.sgst.trim() !== '' || form.igst.trim() !== ''
    if (partsTouched) {
      const cgst = form.cgst.trim() === '' ? 0 : parsePaise(form.cgst)
      const sgst = form.sgst.trim() === '' ? 0 : parsePaise(form.sgst)
      const igst = form.igst.trim() === '' ? 0 : parsePaise(form.igst)
      if (cgst === null || sgst === null || igst === null) {
        return { ok: false, message: 'CGST, SGST and IGST must be rupee amounts.' }
      }
      if (cgst + sgst + igst !== value) {
        return {
          ok: false,
          message: 'CGST, SGST and IGST must add up to the GST amount.',
        }
      }
      gstParts = { cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst }
    }
  }

  let scBps: number | null = null
  let scAmountPaise: number | null = null
  if (scMode === 'percent') {
    const value = parsePercentToBps(form.scPercent)
    if (value === null) {
      return { ok: false, message: 'Service charge must be a percentage from 0 to 100.' }
    }
    scBps = value
  } else if (scMode === 'fixed') {
    const value = parsePaise(form.scAmount)
    if (value === null) {
      return { ok: false, message: 'Enter the service-charge amount read from the bill.' }
    }
    scAmountPaise = value
  }

  let lineItems: LineItemInput[] | null = null
  let lineBasePaise: number | null = null
  if (form.mode === 'itemized') {
    if (form.lines.length === 0) {
      return { ok: false, message: 'Add at least one line item.' }
    }
    lineItems = []
    let total = 0
    for (const line of form.lines) {
      const lineAmount = parsePaise(line.amount)
      if (lineAmount === null || lineAmount <= 0) {
        return { ok: false, message: 'Enter a valid amount for every line item.' }
      }
      const consumers = line.consumerIds.filter((id) => identifiers.has(id))
      if (consumers.length === 0) {
        return { ok: false, message: 'Each line item needs at least one consumer.' }
      }
      const lineGst = parseOptionalPercent(line.gstPercent)
      if (lineGst === 'invalid') {
        return { ok: false, message: 'A line GST must be a percentage from 0 to 100.' }
      }
      const lineSc = parseOptionalPercent(line.scPercent)
      if (lineSc === 'invalid') {
        return { ok: false, message: 'A line service charge must be a percentage from 0 to 100.' }
      }
      lineItems.push({
        description: line.description.trim() || 'Item',
        amountPaise: lineAmount,
        consumerIds: consumers,
        gstBps: lineGst,
        scBps: lineSc,
      })
      total += lineAmount
    }
    lineBasePaise = total
  }

  const basePaise = form.mode === 'itemized' ? lineBasePaise : parsePaise(form.amount)
  if (basePaise === null || basePaise <= 0) {
    return {
      ok: false,
      message:
        form.mode === 'itemized'
          ? 'Enter a valid amount for every line item.'
          : 'Enter a base amount greater than zero.',
    }
  }

  const base = {
    title: form.title,
    date: form.date,
    category: form.category,
    payerId,
    participants,
    baseAmountPaise: basePaise,
  }

  let input: NewExpense
  if (form.mode === 'itemized') {
    input = {
      ...base,
      mode: 'itemized',
      gstBps,
      scBps,
      lineItems: lineItems ?? [],
    }
  } else if (form.mode === 'equal') {
    input = {
      ...base,
      mode: 'equal',
      gstBps,
      scBps,
      gstAmountPaise,
      scAmountPaise,
      gstParts,
    }
  } else {
    const exactShares: Record<string, number> = {}
    for (const id of participants) {
      const value = parsePaise(form.exactAmounts[id] ?? '')
      if (value === null || value < 0) {
        return { ok: false, message: 'Enter an amount for every selected participant.' }
      }
      exactShares[id] = value
    }
    input = {
      ...base,
      mode: 'exact',
      gstBps,
      scBps,
      gstAmountPaise,
      scAmountPaise,
      gstParts,
      exactShares,
    }
  }

  try {
    const prepared = prepareExpense(input)
    return { ok: true, prepared, input }
  } catch (error) {
    return { ok: false, message: describeError(error) }
  }
}

function ExpenseDialog({
  uid,
  tripId,
  people,
  expense,
  suggestions,
  onClose,
}: {
  uid: string
  tripId: string
  people: Person[]
  expense: Expense | null
  suggestions: string[]
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Expense | null>(null)
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<number | null>(
    expense?.updatedAt ?? null,
  )

  const [form, setForm] = useState<FormState>(() =>
    expense ? formFromInput(expenseToInput(expense), people) : blankForm(people),
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  // Selections are derived from the current people list on every render instead
  // of being synced by an effect. A person added or removed while the dialog is
  // open therefore cannot leave a stale id in the payload.
  const peopleIds = new Set(people.map((person) => person.id))
  const payerId = peopleIds.has(form.payerId) ? form.payerId : (people[0]?.id ?? '')
  const selected = form.selectedIds.filter((id) => peopleIds.has(id))
  const lines = form.lines.map((line) => ({
    ...line,
    consumerIds: line.consumerIds.filter((id) => peopleIds.has(id)),
  }))

  const categories = [...new Set([...suggestions, ...DEFAULT_CATEGORIES])]

  const preview = computePreview({ ...form, payerId }, people)

  const basePaise = form.mode === 'itemized' ? null : parsePaise(form.amount)
  const gstBps = form.gstMode === 'percent' ? parsePercentToBps(form.gstPercent) : null
  const scBps = form.scMode === 'percent' ? parsePercentToBps(form.scPercent) : null
  const requiredTotalPaise = (() => {
    if (form.mode === 'itemized') return null
    if (basePaise === null || basePaise <= 0) return null
    if (form.gstMode === 'percent' && gstBps === null) return null
    if (form.scMode === 'percent' && scBps === null) return null
    const fixedGst = form.gstMode === 'fixed' ? parsePaise(form.gstAmount) : null
    if (form.gstMode === 'fixed' && fixedGst === null) return null
    const fixedSc = form.scMode === 'fixed' ? parsePaise(form.scAmount) : null
    if (form.scMode === 'fixed' && fixedSc === null) return null
    try {
      return billTotals(basePaise, gstBps, scBps, fixedGst, fixedSc).totalPaise
    } catch {
      return null
    }
  })()

  let lineBasePaise: number | null = null
  if (form.mode === 'itemized') {
    lineBasePaise = 0
    for (const line of lines) {
      const value = parsePaise(line.amount)
      if (value === null) {
        lineBasePaise = null
        break
      }
      lineBasePaise += value
    }
  }

  let exactEnteredTotal: number | null = null
  if (form.mode === 'exact') {
    exactEnteredTotal = 0
    for (const id of selected) {
      const value = parsePaise(form.exactAmounts[id] ?? '')
      if (value === null) {
        exactEnteredTotal = null
        break
      }
      exactEnteredTotal += value
    }
  }

  function patch(changes: Partial<FormState>) {
    setForm((current) => ({ ...current, ...changes }))
  }

  function setMode(mode: SplitMode) {
    patch({
      mode,
      gstMode: mode === 'itemized' && form.gstMode === 'fixed' ? 'none' : form.gstMode,
      scMode: mode === 'itemized' && form.scMode === 'fixed' ? 'none' : form.scMode,
    })
  }

  function toggleSelected(id: string) {
    setForm((current) => {
      const valid = current.selectedIds.filter((value) => peopleIds.has(value))
      return {
        ...current,
        selectedIds: valid.includes(id)
          ? valid.filter((value) => value !== id)
          : [...valid, id],
      }
    })
  }

  function toggleLineConsumer(lineIndex: number, id: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, index) => {
        if (index !== lineIndex) return line
        const valid = line.consumerIds.filter((value) => peopleIds.has(value))
        return {
          ...line,
          consumerIds: valid.includes(id)
            ? valid.filter((value) => value !== id)
            : [...valid, id],
        }
      }),
    }))
  }

  function updateLine(lineIndex: number, changes: Partial<LineDraft>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, index) =>
        index === lineIndex ? { ...line, ...changes } : line,
      ),
    }))
  }

  async function save(force: boolean) {
    if (!preview.ok) {
      setSubmitError(preview.message)
      return
    }
    setBusy(true)
    setSubmitError(null)
    try {
      if (expense) {
        await updateExpense(db, uid, tripId, expense.id, preview.input, {
          expectedUpdatedAt,
          force,
        })
      } else {
        await createExpense(db, uid, tripId, preview.input)
      }
      onClose()
    } catch (error) {
      if (error instanceof ExpenseConflictError) {
        setConflict(error.cloudExpense)
      } else {
        setSubmitError(describeError(error))
      }
      setBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await save(false)
  }

  function keepSavedCopy() {
    if (!conflict) return
    setForm(formFromInput(expenseToInput(conflict), people))
    setExpectedUpdatedAt(conflict.updatedAt)
    setConflict(null)
    setSubmitError(null)
  }

  const dialogTitle = expense ? 'Edit expense' : 'Add expense'

  return (
    <dialog
      ref={dialogRef}
      // `close` is deliberately not handled: the effect's cleanup calls
      // `dialog.close()`, and under StrictMode that cleanup runs right after the
      // mount effect, so an onClose here would unmount the dialog immediately.
      // Escape arrives as `cancel` instead, which still reaches the parent.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-labelledby="expense-dialog-title"
      aria-describedby="expense-sum-check"
      className="w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="expense-dialog-title" className="text-lg font-semibold tracking-tight">
              {dialogTitle}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Amounts are stored as integer paise (INR).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <CloseIcon />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5">
          {submitError ? <ErrorNotice message={submitError} /> : null}

          {conflict ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">This expense was changed elsewhere.</p>
              <p className="mt-1 text-xs">
                Saved copy: {conflict.title} · {rupee(conflict.totalPaise)} ·{' '}
                {formatDate(conflict.date)}. Choose which version to keep.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={busy}
                  className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-900 disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Keep mine'}
                </button>
                <button
                  type="button"
                  onClick={keepSavedCopy}
                  disabled={busy}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-50 disabled:opacity-60"
                >
                  Use the saved copy
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Title
              <input
                value={form.title}
                onChange={(event) => patch({ title: event.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                placeholder="Dinner"
                autoComplete="off"
                autoFocus
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Date
              <input
                type="date"
                value={form.date}
                max={todayIso()}
                onChange={(event) => patch({ date: event.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Category
              <input
                value={form.category}
                onChange={(event) => patch({ category: event.target.value })}
                list="expense-category-suggestions"
                placeholder="Food"
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
              <datalist id="expense-category-suggestions">
                {categories.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Paid by
              <select
                value={payerId}
                onChange={(event) => patch({ payerId: event.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Split mode
              <select
                value={form.mode}
                onChange={(event) => setMode(event.target.value as SplitMode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                <option value="equal">Equal</option>
                <option value="exact">Exact amounts</option>
                <option value="itemized">Itemized</option>
              </select>
            </label>
          </div>

          {form.mode !== 'itemized' ? (
            <label className="block text-sm font-medium text-slate-700">
              Base amount (₹)
              <input
                value={form.amount}
                onChange={(event) => patch({ amount: event.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:max-w-xs"
              />
            </label>
          ) : null}

          <div className="space-y-3">
            <TaxFields
              label="GST"
              mode={form.gstMode}
              onMode={(mode) => patch({ gstMode: mode })}
              percent={form.gstPercent}
              onPercent={(value) => patch({ gstPercent: value })}
              amount={form.gstAmount}
              onAmount={(value) => patch({ gstAmount: value })}
              allowFixed={form.mode !== 'itemized'}
              percentPlaceholder="e.g. 18"
            />
            {form.gstMode === 'fixed' && form.mode !== 'itemized' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">
                  Optional: split the GST the way the invoice shows it. Leave blank for a single
                  GST amount.
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-medium text-slate-600">
                    CGST (₹)
                    <input
                      value={form.cgst}
                      onChange={(event) => patch({ cgst: event.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    SGST (₹)
                    <input
                      value={form.sgst}
                      onChange={(event) => patch({ sgst: event.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    IGST (₹)
                    <input
                      value={form.igst}
                      onChange={(event) => patch({ igst: event.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    />
                  </label>
                </div>
              </div>
            ) : null}
            <TaxFields
              label="Service charge"
              mode={form.scMode}
              onMode={(mode) => patch({ scMode: mode })}
              percent={form.scPercent}
              onPercent={(value) => patch({ scPercent: value })}
              amount={form.scAmount}
              onAmount={(value) => patch({ scAmount: value })}
              allowFixed={form.mode !== 'itemized'}
              percentPlaceholder="e.g. 10"
            />
          </div>

          {form.mode === 'itemized' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Line items</p>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      lines: [
                        ...current.lines,
                        {
                          description: '',
                          amount: '',
                          consumerIds: people.map((p) => p.id),
                          gstPercent: '',
                          scPercent: '',
                        },
                      ],
                    }))
                  }
                  className="text-sm font-medium text-brand-700 hover:text-brand-800"
                >
                  + Add line
                </button>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="rounded-xl border border-slate-200 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
                    <input
                      value={line.description}
                      onChange={(event) => updateLine(index, { description: event.target.value })}
                      placeholder={`Item ${String(index + 1)}`}
                      aria-label={`Line item ${String(index + 1)} description`}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    />
                    <input
                      value={line.amount}
                      onChange={(event) => updateLine(index, { amount: event.target.value })}
                      inputMode="decimal"
                      placeholder="₹ amount"
                      aria-label={`Line item ${String(index + 1)} amount`}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          lines:
                            current.lines.length === 1
                              ? current.lines
                              : current.lines.filter((_, at) => at !== index),
                        }))
                      }
                      disabled={lines.length === 1}
                      className="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-600">
                      GST % (optional)
                      <input
                        value={line.gstPercent}
                        onChange={(event) => updateLine(index, { gstPercent: event.target.value })}
                        inputMode="decimal"
                        placeholder="Bill rate"
                        aria-label={`Line item ${String(index + 1)} GST percentage`}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      Service % (optional)
                      <input
                        value={line.scPercent}
                        onChange={(event) => updateLine(index, { scPercent: event.target.value })}
                        inputMode="decimal"
                        placeholder="Bill rate"
                        aria-label={`Line item ${String(index + 1)} service-charge percentage`}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-600">Consumers</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {people.map((person) => {
                        const checked = line.consumerIds.includes(person.id)
                        return (
                          <label
                            key={person.id}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLineConsumer(index, person.id)}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            {person.name}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Line items total (base): {lineBasePaise === null ? '—' : rupee(lineBasePaise)}
              </p>
            </div>
          ) : null}

          {form.mode !== 'itemized' ? (
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Participants</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {people.map((person) => {
                  const checked = selected.includes(person.id)
                  return (
                    <label
                      key={person.id}
                      className="inline-flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(person.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {person.name}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : null}

          {form.mode === 'exact' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Exact share per participant (₹)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {selected.map((id) => (
                  <label key={id} className="block text-sm text-slate-700">
                    {personName(people, id)}
                    <input
                      value={form.exactAmounts[id] ?? ''}
                      onChange={(event) =>
                        patch({
                          exactAmounts: { ...form.exactAmounts, [id]: event.target.value },
                        })
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Entered shares total: {exactEnteredTotal === null ? '—' : rupee(exactEnteredTotal)}
                {requiredTotalPaise === null ? '' : ` · Bill total: ${rupee(requiredTotalPaise)}`}
              </p>
            </div>
          ) : null}

          {preview.ok ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Share preview</p>
              <ul className="mt-2 space-y-1">
                {preview.input.participants.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                    <span>{personName(people, id)}</span>
                    <span className="font-medium text-slate-800">
                      {rupee(preview.prepared.shares[id] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            id="expense-sum-check"
            className={`rounded-xl border px-4 py-3 text-sm ${
              preview.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
            aria-live="polite"
          >
            {preview.ok ? (
              <div>
                <p className="font-medium">
                  Live sum check: OK · Total {rupee(preview.prepared.totalPaise)}
                </p>
                <p className="mt-1 text-xs">
                  Base {rupee(preview.prepared.baseAmountPaise)} · GST{' '}
                  {rupee(preview.prepared.gstAmountPaise)} · Service{' '}
                  {rupee(preview.prepared.serviceChargeAmountPaise)} · Shares sum to total.
                </p>
                {preview.prepared.gstParts !== null ? (
                  <p className="mt-1 text-xs">
                    GST split: CGST {rupee(preview.prepared.gstParts.cgstPaise)} · SGST{' '}
                    {rupee(preview.prepared.gstParts.sgstPaise)} · IGST{' '}
                    {rupee(preview.prepared.gstParts.igstPaise)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p>
                <span className="font-medium">Live sum check:</span> {preview.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !preview.ok}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Saving…' : expense ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function TaxFields({
  label,
  mode,
  onMode,
  percent,
  onPercent,
  amount,
  onAmount,
  allowFixed,
  percentPlaceholder,
}: {
  label: string
  mode: TaxMode
  onMode: (mode: TaxMode) => void
  percent: string
  onPercent: (value: string) => void
  amount: string
  onAmount: (value: string) => void
  allowFixed: boolean
  percentPlaceholder: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="block text-xs font-medium text-slate-600">
          Entered as
          <select
            value={mode}
            onChange={(event) => onMode(event.target.value as TaxMode)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="none">No {label.toLowerCase()}</option>
            <option value="percent">Percentage</option>
            {allowFixed ? <option value="fixed">Fixed amount on the bill</option> : null}
          </select>
        </label>
        {mode === 'percent' ? (
          <label className="block text-xs font-medium text-slate-600">
            Percentage (%)
            <input
              value={percent}
              onChange={(event) => onPercent(event.target.value)}
              inputMode="decimal"
              placeholder={percentPlaceholder}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </label>
        ) : mode === 'fixed' ? (
          <label className="block text-xs font-medium text-slate-600">
            Amount (₹)
            <input
              value={amount}
              onChange={(event) => onAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </label>
        ) : (
          <p className="self-end pb-2 text-xs text-slate-500">Not charged on this bill.</p>
        )}
      </div>
    </div>
  )
}
