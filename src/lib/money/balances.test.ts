import { describe, expect, it } from 'vitest'
import { balanceDifferencePaise, computeBalances, type ExpenseForBalance } from './balances'

/** CUJ 2 + CUJ 3 from TESTCASES §3 / the worked example in LOGIC §3.1. */
const dinner: ExpenseForBalance = {
  payerId: 'A',
  baseAmountPaise: 320_000,
  gstAmountPaise: 57_600,
  serviceChargeAmountPaise: 32_000,
  shares: { A: 102_400, B: 102_400, C: 102_400, D: 102_400 },
}

const taxi: ExpenseForBalance = {
  payerId: 'B',
  baseAmountPaise: 150_000,
  gstAmountPaise: 0,
  serviceChargeAmountPaise: 0,
  shares: { A: 50_000, B: 60_000, C: 40_000, D: 0 },
}

const people = [
  { id: 'A', name: 'Alice' },
  { id: 'B', name: 'Bob' },
  { id: 'C', name: 'Carol' },
  { id: 'D', name: 'Dave' },
]

describe('computeBalances', () => {
  it('matches the worked example (TC-BL-01)', () => {
    expect(computeBalances([dinner, taxi], people)).toEqual([
      { personId: 'A', name: 'Alice', paidPaise: 409_600, sharePaise: 152_400, netPaise: 257_200 },
      { personId: 'B', name: 'Bob', paidPaise: 150_000, sharePaise: 162_400, netPaise: -12_400 },
      { personId: 'C', name: 'Carol', paidPaise: 0, sharePaise: 142_400, netPaise: -142_400 },
      { personId: 'D', name: 'Dave', paidPaise: 0, sharePaise: 102_400, netPaise: -102_400 },
    ])
  })

  it('always sums to zero for consistent data (TC-BL-02)', () => {
    expect(balanceDifferencePaise(computeBalances([dinner, taxi], people))).toBe(0)
  })

  it('gives a single person who paid and consumed everything a zero balance (TC-BL-03)', () => {
    const expense: ExpenseForBalance = {
      payerId: 'A',
      baseAmountPaise: 1000,
      gstAmountPaise: 0,
      serviceChargeAmountPaise: 0,
      shares: { A: 1000 },
    }
    expect(computeBalances([expense], [{ id: 'A', name: 'Alice' }])).toEqual([
      { personId: 'A', name: 'Alice', paidPaise: 1000, sharePaise: 1000, netPaise: 0 },
    ])
  })

  it('excludes a retired person (TC-BL-04)', () => {
    const balances = computeBalances([dinner], [
      ...people.slice(0, 3),
      { id: 'D', name: 'Dave', deletedAt: 1 },
    ])
    expect(balances.map((balance) => balance.personId)).toEqual(['A', 'B', 'C'])
  })

  it('excludes a soft-deleted expense (TC-BL-05)', () => {
    const balances = computeBalances([dinner, { ...taxi, deletedAt: 1_700_000_000 }], people)
    expect(balances.find((balance) => balance.personId === 'B')).toEqual({
      personId: 'B',
      name: 'Bob',
      paidPaise: 0,
      sharePaise: 102_400,
      netPaise: -102_400,
    })
    expect(balanceDifferencePaise(balances)).toBe(0)
  })

  it('keeps a person who is only referenced by an expense, with no name', () => {
    // A hard-deleted participant must not break the report: the id stays, the name goes.
    const balances = computeBalances([dinner], people.slice(0, 3))
    expect(balances).toHaveLength(4)
    expect(balances[3]).toEqual({
      personId: 'D',
      name: null,
      paidPaise: 0,
      sharePaise: 102_400,
      netPaise: -102_400,
    })
    expect(balanceDifferencePaise(balances)).toBe(0)
  })

  it('reports corrupt data instead of throwing', () => {
    const corrupt: ExpenseForBalance = { ...dinner, shares: { A: 100_000 } }
    const difference = balanceDifferencePaise(computeBalances([corrupt], people))
    expect(difference).toBe(409_600 - 100_000)
  })

  it('rejects non-integer amounts loudly', () => {
    expect(() =>
      computeBalances([{ ...dinner, baseAmountPaise: 320_000.5 }], people),
    ).toThrow(TypeError)
    expect(() =>
      computeBalances([{ ...dinner, shares: { A: 1.5 } }], people),
    ).toThrow(TypeError)
  })
})
