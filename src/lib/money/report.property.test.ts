import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { PersonForBalance } from './balances'
import { buildTripReport, type ExpenseForReport } from './report'
import { splitEqual } from './split'

/**
 * Invariants the report must never break:
 *
 * - Paid, shared and categorised money all add up to the same trip total.
 * - Nets sum to zero for consistent data, so transfers can settle it.
 * - Every person's breakdown sums to their own share.
 * - The average per head loses no money: `average × heads ≤ total`.
 * - Transfers move exactly the money that is owed, and never invent paise.
 */
const PEOPLE: PersonForBalance[] = [
  { id: 'p0', name: 'P0' },
  { id: 'p1', name: 'P1' },
  { id: 'p2', name: 'P2' },
  { id: 'p3', name: 'P3' },
]

const expenseSpec = fc.record({
  basePaise: fc.integer({ min: 1, max: 1_000_000 }),
  consumers: fc.uniqueArray(fc.integer({ min: 0, max: PEOPLE.length - 1 }), {
    minLength: 1,
    maxLength: PEOPLE.length,
  }),
  category: fc.constantFrom('Food', 'Transport', 'Stay'),
  date: fc.constantFrom('2026-11-01', '2026-11-02', '2026-11-03'),
  deleted: fc.boolean(),
})

interface ExpenseSpec {
  basePaise: number
  consumers: number[]
  category: string
  date: string
  deleted: boolean
}

function toExpenses(specs: readonly ExpenseSpec[]): ExpenseForReport[] {
  return specs.map((spec, index) => {
    const participantIds = spec.consumers.map((at) => PEOPLE[at].id)
    return {
      id: `e${String(index)}`,
      title: `Expense ${String(index)}`,
      date: spec.date,
      category: spec.category,
      payerId: participantIds[0],
      baseAmountPaise: spec.basePaise,
      gstAmountPaise: 0,
      serviceChargeAmountPaise: 0,
      shares: splitEqual(spec.basePaise, participantIds),
      deletedAt: spec.deleted ? 1 : null,
    }
  })
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

describe('buildTripReport properties', () => {
  it('conserves every paise across totals, shares, categories and transfers', () => {
    fc.assert(
      fc.property(fc.array(expenseSpec, { maxLength: 8 }), (specs) => {
        const expenses = toExpenses(specs)
        const report = buildTripReport(expenses, PEOPLE)
        const liveCount = specs.filter((spec) => !spec.deleted).length

        expect(report.liveExpenseCount).toBe(liveCount)
        expect(sum(report.people.map((person) => person.paidPaise))).toBe(report.tripTotalPaise)
        expect(sum(report.people.map((person) => person.sharePaise))).toBe(report.tripTotalPaise)
        expect(sum(report.people.map((person) => person.netPaise))).toBe(0)
        expect(report.differencePaise).toBe(0)
        expect(sum(report.categories.map((category) => category.totalPaise))).toBe(
          report.tripTotalPaise,
        )

        // The average is a floor: it cannot create a paise or exceed the total.
        expect(report.averagePerHeadPaise * report.headCount).toBeLessThanOrEqual(
          report.tripTotalPaise,
        )
        expect((report.averagePerHeadPaise + 1) * report.headCount).toBeGreaterThan(
          report.tripTotalPaise,
        )

        for (const person of report.people) {
          expect(sum(person.lines.map((line) => line.sharePaise))).toBe(person.sharePaise)
        }

        const owed = sum(
          report.people.filter((person) => person.netPaise > 0).map((person) => person.netPaise),
        )
        expect(sum(report.transfers.map((transfer) => transfer.amountPaise))).toBe(owed)
        for (const transfer of report.transfers) {
          expect(transfer.amountPaise).toBeGreaterThan(0)
          expect(transfer.from).not.toBe(transfer.to)
        }
      }),
      { numRuns: 200 },
    )
  })
})
