import { describe, expect, it } from 'vitest'
import { finalizeExpense, splitEqual } from './money'
import { prepareExpense } from './firestore'
import type { Expense } from './firestore'
import {
  applyBeforeSnapshot,
  expenseToInput,
  inferSplitMode,
  inferTaxMode,
  taxInputFromExpense,
} from './expenseInput'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

/** A stored expense with a spread of overrides; the defaults are CJU 2. */
function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tripId: '22222222-2222-4222-8222-222222222222',
    title: 'Dinner',
    date: '2024-01-01',
    category: 'Food',
    payerId: A,
    participants: [A, B, C, D],
    baseAmountPaise: 320_000,
    gstAmountPaise: 57_600,
    serviceChargeAmountPaise: 32_000,
    totalPaise: 409_600,
    gstBps: 1800,
    serviceChargeBps: 1000,
    gstParts: null,
    lineItems: null,
    shares: splitEqual(409_600, [A, B, C, D]),
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
    lastHistoryId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  }
}

describe('inferTaxMode', () => {
  it('reads a stored rate as percent entry', () => {
    expect(inferTaxMode(1800, 0)).toBe('percent')
  })

  it('reads no rate with a positive amount as fixed entry', () => {
    expect(inferTaxMode(null, 25_000)).toBe('fixed')
  })

  it('reads no rate and no amount as no tax', () => {
    expect(inferTaxMode(null, 0)).toBe('none')
  })
})

describe('inferSplitMode', () => {
  it('reopens an equal split on the equal tab', () => {
    expect(inferSplitMode(makeExpense())).toBe('equal')
  })

  it('reopens a lopsided split on the exact tab', () => {
    const exact = makeExpense({
      baseAmountPaise: 150_000,
      gstAmountPaise: 0,
      serviceChargeAmountPaise: 0,
      totalPaise: 150_000,
      gstBps: null,
      serviceChargeBps: null,
      participants: [A, B, C],
      shares: { [A]: 50_000, [B]: 60_000, [C]: 40_000 },
    })
    expect(inferSplitMode(exact)).toBe('exact')
  })

  it('reopens a bill with line items on the itemized tab', () => {
    const itemized = makeExpense({
      lineItems: [
        {
          description: 'Snacks',
          amountPaise: 320_000,
          consumerIds: [A, B],
          gstBps: 0,
          scBps: 0,
          gstAmountPaise: 0,
          serviceChargeAmountPaise: 0,
        },
      ],
      gstBps: null,
      serviceChargeBps: null,
      gstAmountPaise: 0,
      serviceChargeAmountPaise: 0,
      totalPaise: 320_000,
      shares: { [A]: 160_000, [B]: 160_000 },
    })
    expect(inferSplitMode(itemized)).toBe('itemized')
  })
})

describe('expenseToInput round-trip', () => {
  it('reproduces an equal split with percentage tax exactly', () => {
    const expense = makeExpense()
    const prepared = prepareExpense(expenseToInput(expense))

    expect(prepared.shares).toEqual(expense.shares)
    expect(prepared.totalPaise).toBe(expense.totalPaise)
    expect(prepared.gstBps).toBe(1800)
    expect(prepared.gstAmountPaise).toBe(57_600)
    expect(prepared.lineItems).toBeNull()
  })

  it('reproduces an exact split exactly', () => {
    const expense = makeExpense({
      baseAmountPaise: 150_000,
      gstAmountPaise: 0,
      serviceChargeAmountPaise: 0,
      totalPaise: 150_000,
      gstBps: null,
      serviceChargeBps: null,
      participants: [A, B, C],
      shares: { [A]: 50_000, [B]: 60_000, [C]: 40_000 },
    })

    const input = expenseToInput(expense)
    expect(input.mode).toBe('exact')
    expect(input.exactShares).toEqual(expense.shares)

    const prepared = prepareExpense(input)
    expect(prepared.shares).toEqual(expense.shares)
    expect(prepared.totalPaise).toBe(150_000)
  })

  it('reproduces an itemized bill with per-line rates exactly', () => {
    const lineItems = [
      { description: 'Snacks', amountPaise: 80_000, consumerIds: [A, C], gstBps: 0, scBps: 0 },
      { description: 'Fruit', amountPaise: 100_000, consumerIds: [A, B, C, D] },
    ]
    // Let the money layer produce the canonical totals and shares, so the test
    // asserts a round-trip rather than a hand-copied (and possibly wrong) split.
    const canonical = finalizeExpense({
      mode: 'itemized',
      baseAmountPaise: 180_000,
      gstBps: 1800,
      participantIds: [A, B, C, D],
      lineItems,
    })
    const expense = makeExpense({
      baseAmountPaise: canonical.basePaise,
      gstAmountPaise: canonical.gstPaise,
      serviceChargeAmountPaise: canonical.serviceChargePaise,
      totalPaise: canonical.totalPaise,
      gstBps: 1800,
      serviceChargeBps: null,
      participants: [A, B, C, D],
      lineItems: canonical.lineItems,
      shares: canonical.shares,
    })

    const prepared = prepareExpense(expenseToInput(expense))
    expect(prepared.lineItems).toEqual(expense.lineItems)
    expect(prepared.gstAmountPaise).toBe(expense.gstAmountPaise)
    expect(prepared.totalPaise).toBe(expense.totalPaise)
    expect(prepared.shares).toEqual(expense.shares)
  })

  it('reproduces a fixed GST split into CGST/SGST/IGST exactly', () => {
    const expense = makeExpense({
      baseAmountPaise: 100_000,
      gstAmountPaise: 18_000,
      serviceChargeAmountPaise: 0,
      totalPaise: 118_000,
      gstBps: null,
      serviceChargeBps: null,
      gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
      participants: [A, B],
      shares: { [A]: 59_000, [B]: 59_000 },
    })

    const tax = taxInputFromExpense(expense)
    expect(tax.gstMode).toBe('fixed')
    expect(tax.gstAmountPaise).toBe(18_000)
    expect(tax.gstParts).toEqual({ cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 })

    const prepared = prepareExpense(expenseToInput(expense))
    expect(prepared.gstAmountPaise).toBe(18_000)
    expect(prepared.gstParts).toEqual(expense.gstParts)
    expect(prepared.gstBps).toBeNull()
    expect(prepared.shares).toEqual(expense.shares)
  })

  it('reproduces a bill with no tax exactly', () => {
    const expense = makeExpense({
      gstAmountPaise: 0,
      serviceChargeAmountPaise: 0,
      totalPaise: 320_000,
      gstBps: null,
      serviceChargeBps: null,
      shares: splitEqual(320_000, [A, B, C, D]),
    })

    const prepared = prepareExpense(expenseToInput(expense))
    expect(prepared.gstAmountPaise).toBe(0)
    expect(prepared.serviceChargeAmountPaise).toBe(0)
    expect(prepared.shares).toEqual(expense.shares)
  })
})

describe('applyBeforeSnapshot', () => {
  it('puts the changed fields back and leaves the rest alone', () => {
    const current = makeExpense({ title: 'Edited title', totalPaise: 409_600 })
    const restored = applyBeforeSnapshot(current, { title: 'Dinner' })

    expect(restored.title).toBe('Dinner')
    expect(restored.shares).toEqual(current.shares)
    expect(restored.updatedAt).toBe(current.updatedAt)
  })

  it('returns the expense unchanged for a null snapshot', () => {
    const expense = makeExpense()
    expect(applyBeforeSnapshot(expense, null)).toBe(expense)
  })

  it('ignores a key that is not an expense field', () => {
    const expense = makeExpense()
    const restored = applyBeforeSnapshot(expense, { notAField: 1, title: 'Lunch' })
    expect(restored.title).toBe('Lunch')
    expect((restored as unknown as Record<string, unknown>).notAField).toBeUndefined()
  })
})
