import { describe, expect, it } from 'vitest'
import type { Expense } from './firestore'
import {
  expenseCategories,
  filterExpenses,
  matchesExpenseFilter,
  sortExpenses,
  viewExpenses,
} from './expenseView'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tripId: '22222222-2222-4222-8222-222222222222',
    title: 'Dinner',
    date: '2024-01-10',
    category: 'Food',
    payerId: A,
    participants: [A, B],
    baseAmountPaise: 100_000,
    gstAmountPaise: 0,
    serviceChargeAmountPaise: 0,
    totalPaise: 100_000,
    gstBps: null,
    serviceChargeBps: null,
    gstParts: null,
    lineItems: null,
    shares: { [A]: 50_000, [B]: 50_000 },
    createdAt: 10,
    updatedAt: 10,
    deletedAt: null,
    lastHistoryId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  }
}

const dinner = makeExpense({
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  title: 'Dinner',
  date: '2024-01-10',
  category: 'Food',
  totalPaise: 100_000,
  createdAt: 10,
})
const taxi = makeExpense({
  id: 'bbbbbbbb-2222-4222-8222-222222222222',
  title: 'Taxi',
  date: '2024-01-12',
  category: 'Transport',
  totalPaise: 250_000,
  createdAt: 12,
})
const movie = makeExpense({
  id: 'cccccccc-3333-4333-8333-333333333333',
  title: 'Movie',
  date: '2024-01-12',
  category: 'Fun',
  totalPaise: 40_000,
  createdAt: 13,
})

const all = [dinner, taxi, movie]

describe('filterExpenses', () => {
  it('returns everything for an empty filter', () => {
    expect(filterExpenses(all, {})).toEqual(all)
  })

  it('filters by category', () => {
    expect(filterExpenses(all, { category: 'Fun' })).toEqual([movie])
  })

  it('filters by payer', () => {
    expect(filterExpenses(all, { payerId: A })).toEqual(all)
    expect(filterExpenses(all, { payerId: 'nobody' })).toEqual([])
  })

  it('filters a date range inclusively', () => {
    expect(filterExpenses(all, { from: '2024-01-11', to: '2024-01-12' })).toEqual([taxi, movie])
  })

  it('matches free text against the title and the category, case-insensitively', () => {
    expect(filterExpenses(all, { text: 'din' })).toEqual([dinner])
    expect(filterExpenses(all, { text: 'transport' })).toEqual([taxi])
  })

  it('combines conditions', () => {
    expect(filterExpenses(all, { from: '2024-01-11', category: 'Fun' })).toEqual([movie])
  })

  it('ignores blank filter values', () => {
    expect(filterExpenses(all, { text: '   ', category: '', payerId: '', from: '', to: '' })).toEqual(
      all,
    )
  })

  it('treats a soft-deleted expense like any other row', () => {
    const deleted = makeExpense({ deletedAt: 99, category: 'Food' })
    expect(matchesExpenseFilter(deleted, { category: 'Food' })).toBe(true)
  })
})

describe('sortExpenses', () => {
  it('sorts newest date first and breaks ties by newest write', () => {
    expect(sortExpenses(all, 'date-desc').map((e) => e.title)).toEqual(['Movie', 'Taxi', 'Dinner'])
  })

  it('sorts oldest date first', () => {
    expect(sortExpenses(all, 'date-asc').map((e) => e.title)).toEqual(['Dinner', 'Taxi', 'Movie'])
  })

  it('sorts by amount', () => {
    expect(sortExpenses(all, 'amount-desc').map((e) => e.title)).toEqual(['Taxi', 'Dinner', 'Movie'])
    expect(sortExpenses(all, 'amount-asc').map((e) => e.title)).toEqual(['Movie', 'Dinner', 'Taxi'])
  })

  it('sorts by title case-insensitively', () => {
    expect(sortExpenses(all, 'title-asc').map((e) => e.title)).toEqual(['Dinner', 'Movie', 'Taxi'])
  })

  it('never mutates the input array', () => {
    const input = [...all]
    sortExpenses(input, 'amount-asc')
    expect(input).toEqual(all)
  })

  it('is deterministic when date and amount tie, using the id', () => {
    const first = makeExpense({ id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Same' })
    const second = makeExpense({ id: '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Same' })
    expect(sortExpenses([second, first], 'date-desc').map((e) => e.id)).toEqual([
      first.id,
      second.id,
    ])
  })
})

describe('viewExpenses', () => {
  it('filters before sorting', () => {
    expect(viewExpenses(all, { from: '2024-01-11' }, 'amount-asc').map((e) => e.title)).toEqual([
      'Movie',
      'Taxi',
    ])
  })
})

describe('expenseCategories', () => {
  it('lists distinct categories sorted case-insensitively', () => {
    expect(expenseCategories([...all, makeExpense({ category: 'food' })])).toEqual([
      'Food',
      'Fun',
      'Transport',
    ])
  })
})
