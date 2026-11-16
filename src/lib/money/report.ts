/**
 * The settlement report, assembled from integer paise.
 *
 * Everything here is derived: no stored report document, no clock, no I/O.
 * The same input always produces the same report, which is what lets the screen
 * and the PDF/PNG export share one calculation.
 *
 * PRD G5: trip total, average per head, each person's share/paid/net, minimal
 * transfers, per-person expense breakdown, and category totals. PRD OQ5: there
 * is no lock, so this recomputes whenever the live data changes.
 */

import {
  balanceDifferencePaise,
  computeBalances,
  type ExpenseForBalance,
  type PersonBalance,
  type PersonForBalance,
} from './balances'
import { isPaise } from './paise'
import { calculateSettlement, type Transfer } from './settlement'

/** The expense fields the report reads. Money is already integer paise. */
export interface ExpenseForReport extends ExpenseForBalance {
  id: string
  title: string
  /** `YYYY-MM-DD`. */
  date: string
  category: string
}

/** One expense line inside a person's breakdown. */
export interface ReportLine {
  expenseId: string
  title: string
  date: string
  sharePaise: number
}

/** A person's totals plus the expenses that make up their share. */
export interface PersonReport extends PersonBalance {
  lines: ReportLine[]
}

export interface CategoryTotal {
  category: string
  totalPaise: number
}

export interface TripReport {
  /** Sum of the live expenses' base + GST + service charge. */
  tripTotalPaise: number
  /** Active people in the trip. */
  headCount: number
  /** Floor of the trip total divided by head count; informational only. */
  averagePerHeadPaise: number
  liveExpenseCount: number
  people: PersonReport[]
  categories: CategoryTotal[]
  /** Empty when `differencePaise` is not zero, so corrupt data never invents money. */
  transfers: Transfer[]
  /** Sum of all nets; zero for consistent data. Non-zero means a data warning. */
  differencePaise: number
}

function requirePaise(value: number, label: string): number {
  if (!isPaise(value)) {
    throw new TypeError(`${label} must be integer paise, received ${String(value)}`)
  }
  return value
}

/** Base + tax + service charge, the same total the balance calculation uses. */
function expenseTotalPaise(expense: ExpenseForBalance): number {
  return (
    requirePaise(expense.baseAmountPaise, 'baseAmountPaise') +
    requirePaise(expense.gstAmountPaise, 'gstAmountPaise') +
    requirePaise(expense.serviceChargeAmountPaise, 'serviceChargeAmountPaise')
  )
}

/** Code-unit ordering, so the report is identical on every device and locale. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareLines(left: ReportLine, right: ReportLine): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1
  return (
    compareText(left.title, right.title) ||
    compareText(left.expenseId, right.expenseId)
  )
}

function compareCategories(left: CategoryTotal, right: CategoryTotal): number {
  if (left.totalPaise !== right.totalPaise) return right.totalPaise - left.totalPaise
  return compareText(left.category, right.category)
}

function isLive(expense: ExpenseForBalance): boolean {
  return expense.deletedAt === null || expense.deletedAt === undefined
}

/**
 * Builds the report for one trip.
 *
 * Soft-deleted expenses are excluded everywhere: totals, categories, balances,
 * transfers and the per-person breakdown. A person who is still referenced but
 * no longer in `people` keeps a row with `name: null`, so the screen can render
 * "Removed person" instead of dropping their share.
 */
export function buildTripReport(
  expenses: readonly ExpenseForReport[],
  people: readonly PersonForBalance[],
): TripReport {
  const live = expenses.filter(isLive)

  let tripTotalPaise = 0
  const categoryTotals = new Map<string, number>()
  const linesByPerson = new Map<string, ReportLine[]>()

  for (const expense of live) {
    const total = expenseTotalPaise(expense)
    tripTotalPaise += total

    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + total)

    for (const [personId, sharePaise] of Object.entries(expense.shares)) {
      requirePaise(sharePaise, `share for ${personId}`)
      const lines = linesByPerson.get(personId) ?? []
      lines.push({
        expenseId: expense.id,
        title: expense.title,
        date: expense.date,
        sharePaise,
      })
      linesByPerson.set(personId, lines)
    }
  }

  const balances = computeBalances(live, people)
  const differencePaise = balanceDifferencePaise(balances)

  const peopleReports: PersonReport[] = balances.map((balance) => ({
    ...balance,
    lines: (linesByPerson.get(balance.personId) ?? []).sort(compareLines),
  }))

  const categories: CategoryTotal[] = [...categoryTotals.entries()]
    .map(([category, totalPaise]) => ({ category, totalPaise }))
    .sort(compareCategories)

  const headCount = people.filter(
    (person) => person.deletedAt === null || person.deletedAt === undefined,
  ).length

  return {
    tripTotalPaise,
    headCount,
    // Integer paise only. The remainder is left in the trip total rather than
    // invented as a fraction; the property test pins that no paise are lost.
    averagePerHeadPaise: headCount > 0 ? Math.floor(tripTotalPaise / headCount) : 0,
    liveExpenseCount: live.length,
    people: peopleReports,
    categories,
    transfers:
      differencePaise === 0
        ? calculateSettlement(
            balances.map((balance) => ({
              personId: balance.personId,
              netPaise: balance.netPaise,
            })),
          )
        : [],
    differencePaise,
  }
}
