import { describe, expect, it } from 'vitest'
import { buildTripReport, type ExpenseForReport } from './report'
import type { PersonForBalance } from './balances'

const people: PersonForBalance[] = [
  { id: 'A', name: 'Alice' },
  { id: 'B', name: 'Bob' },
  { id: 'C', name: 'Carol' },
  { id: 'D', name: 'Dave' },
]

const dinner: ExpenseForReport = {
  id: 'e1',
  title: 'Dinner',
  date: '2026-11-02',
  category: 'Food',
  payerId: 'A',
  baseAmountPaise: 320_000,
  gstAmountPaise: 57_600,
  serviceChargeAmountPaise: 32_000,
  shares: { A: 102_400, B: 102_400, C: 102_400, D: 102_400 },
  deletedAt: null,
}

const taxi: ExpenseForReport = {
  id: 'e2',
  title: 'Taxi',
  date: '2026-11-01',
  category: 'Transport',
  payerId: 'B',
  baseAmountPaise: 150_000,
  gstAmountPaise: 0,
  serviceChargeAmountPaise: 0,
  shares: { A: 50_000, B: 60_000, C: 40_000, D: 0 },
  deletedAt: null,
}

describe('buildTripReport', () => {
  it('matches the worked example (PRD G5 / LOGIC §3)', () => {
    const report = buildTripReport([dinner, taxi], people)

    expect(report.tripTotalPaise).toBe(559_600)
    expect(report.headCount).toBe(4)
    expect(report.averagePerHeadPaise).toBe(139_900)
    expect(report.liveExpenseCount).toBe(2)
    expect(report.differencePaise).toBe(0)

    expect(report.people.map(({ personId, paidPaise, sharePaise, netPaise }) => ({
      personId,
      paidPaise,
      sharePaise,
      netPaise,
    }))).toEqual([
      { personId: 'A', paidPaise: 409_600, sharePaise: 152_400, netPaise: 257_200 },
      { personId: 'B', paidPaise: 150_000, sharePaise: 162_400, netPaise: -12_400 },
      { personId: 'C', paidPaise: 0, sharePaise: 142_400, netPaise: -142_400 },
      { personId: 'D', paidPaise: 0, sharePaise: 102_400, netPaise: -102_400 },
    ])

    expect(report.transfers).toEqual([
      { from: 'C', to: 'A', amountPaise: 142_400 },
      { from: 'D', to: 'A', amountPaise: 102_400 },
      { from: 'B', to: 'A', amountPaise: 12_400 },
    ])
  })

  it('groups category totals and orders them by amount then name', () => {
    const report = buildTripReport([dinner, taxi], people)
    expect(report.categories).toEqual([
      { category: 'Food', totalPaise: 409_600 },
      { category: 'Transport', totalPaise: 150_000 },
    ])
  })

  it('lists each person’s expenses newest first and sums to their share', () => {
    const report = buildTripReport([dinner, taxi], people)
    const alice = report.people.find((person) => person.personId === 'A')

    expect(alice?.lines).toEqual([
      { expenseId: 'e1', title: 'Dinner', date: '2026-11-02', sharePaise: 102_400 },
      { expenseId: 'e2', title: 'Taxi', date: '2026-11-01', sharePaise: 50_000 },
    ])
    expect(alice?.lines.reduce((total, line) => total + line.sharePaise, 0)).toBe(alice?.sharePaise)
  })

  it('excludes soft-deleted expenses from every total', () => {
    const report = buildTripReport([dinner, { ...taxi, deletedAt: 1 }], people)

    expect(report.tripTotalPaise).toBe(409_600)
    expect(report.liveExpenseCount).toBe(1)
    expect(report.categories).toEqual([{ category: 'Food', totalPaise: 409_600 }])
    expect(report.transfers.reduce((total, transfer) => total + transfer.amountPaise, 0)).toBe(
      307_200,
    )
    expect(report.people.every((person) => person.lines.length === 1)).toBe(true)
  })

  it('keeps a row for a person referenced by an expense but no longer in the trip', () => {
    const ghost: ExpenseForReport = {
      ...taxi,
      id: 'e3',
      shares: { A: 100_000, ghost: 50_000 },
    }
    const report = buildTripReport([ghost], people)

    const removed = report.people.find((person) => person.personId === 'ghost')
    expect(removed).toMatchObject({ name: null, sharePaise: 50_000 })
  })

  it('reports an empty trip without inventing money or transfers', () => {
    const report = buildTripReport([], people)
    expect(report).toMatchObject({
      tripTotalPaise: 0,
      headCount: 4,
      averagePerHeadPaise: 0,
      liveExpenseCount: 0,
      categories: [],
      transfers: [],
      differencePaise: 0,
    })
    expect(report.people).toHaveLength(4)
  })

  it('refuses to settle corrupt balances and exposes the difference', () => {
    // Shares that do not add up to the bill make the nets non-zero.
    const corrupt: ExpenseForReport = { ...taxi, shares: { A: 50_000 } }
    const report = buildTripReport([corrupt], people)

    expect(report.differencePaise).toBe(100_000)
    expect(report.transfers).toEqual([])
  })
})
