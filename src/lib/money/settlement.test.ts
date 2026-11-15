import { describe, expect, it } from 'vitest'
import { calculateSettlement, type BalanceForSettlement } from './settlement'

function balances(entries: Record<string, number>): BalanceForSettlement[] {
  return Object.entries(entries).map(([personId, netPaise]) => ({ personId, netPaise }))
}

describe('calculateSettlement', () => {
  it('settles the worked example in LOGIC §3.2', () => {
    expect(
      calculateSettlement(balances({ A: 257_200, B: -12_400, C: -142_400, D: -102_400 })),
    ).toEqual([
      { from: 'C', to: 'A', amountPaise: 142_400 },
      { from: 'D', to: 'A', amountPaise: 102_400 },
      { from: 'B', to: 'A', amountPaise: 12_400 },
    ])
  })

  it('pairs one creditor with several debtors (TC-ST-01)', () => {
    expect(calculateSettlement(balances({ A: 257_200, B: -12_400, C: -142_400, D: -102_400 })))
      .toHaveLength(3)
  })

  it('pairs one debtor with several creditors (TC-ST-02)', () => {
    expect(calculateSettlement(balances({ A: 100, B: -50, C: -50 }))).toEqual([
      { from: 'B', to: 'A', amountPaise: 50 },
      { from: 'C', to: 'A', amountPaise: 50 },
    ])
  })

  it('handles a single pair (TC-ST-02b)', () => {
    expect(calculateSettlement(balances({ A: 100, B: -100 }))).toEqual([
      { from: 'B', to: 'A', amountPaise: 100 },
    ])
  })

  it('breaks ties by person id (TC-ST-03)', () => {
    expect(calculateSettlement(balances({ A: 100, B: 100, C: -100, D: -100 }))).toEqual([
      { from: 'C', to: 'A', amountPaise: 100 },
      { from: 'D', to: 'B', amountPaise: 100 },
    ])
  })

  it('pays the largest debt first (TC-ST-04)', () => {
    expect(calculateSettlement(balances({ A: 100, B: 100, C: -150, D: -50 }))).toEqual([
      { from: 'C', to: 'A', amountPaise: 100 },
      { from: 'C', to: 'B', amountPaise: 50 },
      { from: 'D', to: 'B', amountPaise: 50 },
    ])
  })

  it('walks through several creditors and debtors (TC-ST-05)', () => {
    expect(
      calculateSettlement(balances({ A: 80, B: 70, C: 50, D: -100, E: -100 })),
    ).toEqual([
      { from: 'D', to: 'A', amountPaise: 80 },
      { from: 'D', to: 'B', amountPaise: 20 },
      { from: 'E', to: 'B', amountPaise: 50 },
      { from: 'E', to: 'C', amountPaise: 50 },
    ])
  })

  it('returns nothing when everyone is square', () => {
    expect(calculateSettlement(balances({ A: 0, B: 0 }))).toEqual([])
    expect(calculateSettlement([])).toEqual([])
  })

  it('never mutates the balances it was given', () => {
    const input = balances({ A: 100, B: -60, C: -40 })
    const snapshot = input.map((balance) => ({ ...balance }))
    calculateSettlement(input)
    expect(input).toEqual(snapshot)
    expect(calculateSettlement(input)).toEqual(calculateSettlement(input))
  })

  it('refuses to settle an unbalanced set', () => {
    // TC-ST-01 as originally written omitted one participant and no longer sums to zero.
    expect(() => calculateSettlement(balances({ A: 257_200, B: -12_400, C: -142_400 }))).toThrow(
      /sum to zero/,
    )
  })
})
