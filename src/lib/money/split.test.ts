import { describe, expect, it } from 'vitest'
import { splitEqual, splitEvenly, splitExact, itemizedShares } from './split'
import { sumPaise } from './paise'

describe('splitEvenly', () => {
  it('splits without losing a paise', () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33])
    expect(splitEvenly(100, 1)).toEqual([100])
    expect(splitEvenly(0, 4)).toEqual([0, 0, 0, 0])
  })

  it('gives the remainder to the earliest shares', () => {
    expect(splitEvenly(1, 4)).toEqual([1, 0, 0, 0])
    expect(splitEvenly(5, 2)).toEqual([3, 2])
  })

  it('keeps negative totals intact', () => {
    expect(splitEvenly(-100, 3)).toEqual([-33, -33, -34])
    expect(sumPaise(splitEvenly(-100, 3))).toBe(-100)
  })

  it('returns no shares for zero parts', () => {
    expect(splitEvenly(100, 0)).toEqual([])
  })

  it('rejects a negative part count', () => {
    expect(() => splitEvenly(100, -1)).toThrow(TypeError)
  })

  it('rejects a non-integer total', () => {
    expect(() => splitEvenly(12.5, 2)).toThrow(TypeError)
  })
})

describe('splitEqual', () => {
  it('matches the equal-split cases in TESTCASES §1.1', () => {
    expect(splitEqual(409_600, ['p1', 'p2', 'p3', 'p4'])).toEqual({
      p1: 102_400,
      p2: 102_400,
      p3: 102_400,
      p4: 102_400,
    }) // TC-EQ-01
    expect(splitEqual(100, ['a', 'b', 'c'])).toEqual({ a: 34, b: 33, c: 33 }) // TC-EQ-02
    expect(splitEqual(101, ['a', 'b', 'c'])).toEqual({ a: 34, b: 34, c: 33 }) // TC-EQ-03
    expect(splitEqual(50_000, ['a'])).toEqual({ a: 50_000 }) // TC-EQ-04
    expect(splitEqual(0, ['a', 'b', 'c'])).toEqual({ a: 0, b: 0, c: 0 }) // TC-EQ-05
    expect(splitEqual(1000, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])).toEqual({
      p1: 143,
      p2: 143,
      p3: 143,
      p4: 143,
      p5: 143,
      p6: 143,
      p7: 142,
    }) // TC-EQ-06
  })

  it('gives the extra paise to the lowest person ids, not to selection order', () => {
    expect(splitEqual(100, ['c', 'a', 'b'])).toEqual({ a: 34, b: 33, c: 33 })
    expect(splitEqual(100, ['b', 'c', 'a'])).toEqual(splitEqual(100, ['a', 'b', 'c']))
  })

  it('rejects an empty participant list, duplicate ids and negative totals', () => {
    expect(() => splitEqual(100, [])).toThrow(TypeError)
    expect(() => splitEqual(100, ['a', 'a'])).toThrow(TypeError)
    expect(() => splitEqual(-1, ['a'])).toThrow(TypeError)
  })
})

describe('splitExact', () => {
  it('accepts shares that sum to the bill (TESTCASES §1.2)', () => {
    expect(
      splitExact({ a: 50_000, b: 60_000, c: 40_000 }, 150_000, ['a', 'b', 'c']),
    ).toEqual({ a: 50_000, b: 60_000, c: 40_000 })
  })

  it('accepts shares that sum to the bill including tax', () => {
    expect(
      splitExact({ a: 59_000, b: 70_800, c: 47_200 }, 177_000, ['a', 'b', 'c']),
    ).toEqual({ a: 59_000, b: 70_800, c: 47_200 })
  })

  it('rejects shares that do not sum to the bill', () => {
    expect(() => splitExact({ a: 50_000, b: 50_000 }, 150_000, ['a', 'b'])).toThrow(
      /sum to the total bill/,
    )
  })

  it('rejects a missing or extra participant', () => {
    expect(() => splitExact({ a: 150_000 }, 150_000, ['a', 'b'])).toThrow(
      /every participant/,
    )
    expect(() => splitExact({ a: 100_000, b: 50_000, c: 0 }, 150_000, ['a', 'b'])).toThrow(
      /every participant/,
    )
  })

  it('rejects negative and fractional shares', () => {
    expect(() => splitExact({ a: 250, b: -50 }, 200, ['a', 'b'])).toThrow(TypeError)
    expect(() => splitExact({ a: 100.5, b: 99.5 }, 200, ['a', 'b'])).toThrow(TypeError)
  })
})

describe('itemizedShares', () => {
  it('splits each line across its consumers (CUJ 4)', () => {
    const result = itemizedShares(
      [
        { description: 'Snacks', amountPaise: 80_000, consumerIds: ['A', 'C'] },
        { description: 'Drinks', amountPaise: 60_000, consumerIds: ['B', 'D'] },
        { description: 'Fruit', amountPaise: 100_000, consumerIds: ['A', 'B', 'C', 'D'] },
      ],
      ['A', 'B', 'C', 'D'],
    )

    expect(result.shares).toEqual({ A: 65_000, B: 55_000, C: 65_000, D: 55_000 })
    expect(result.basePaise).toBe(240_000)
    expect(result.gstPaise).toBe(0)
    expect(result.totalPaise).toBe(240_000)
  })

  it('taxes each line at its own rate, falling back to the bill rate', () => {
    // TESTCASES TC-IT-03: 18% on Snacks only, Drinks explicitly untaxed.
    const result = itemizedShares(
      [
        { description: 'Snacks', amountPaise: 80_000, consumerIds: ['A', 'C'], gstBps: 1800 },
        { description: 'Drinks', amountPaise: 60_000, consumerIds: ['B', 'D'], gstBps: 0 },
      ],
      ['A', 'B', 'C', 'D'],
      { gstBps: 1800 },
    )

    expect(result.shares).toEqual({ A: 47_200, B: 30_000, C: 47_200, D: 30_000 })
    expect(result.basePaise).toBe(140_000)
    expect(result.gstPaise).toBe(14_400)
    expect(result.totalPaise).toBe(154_400)
  })

  it('applies the bill-level rate to lines that do not override it', () => {
    const result = itemizedShares(
      [
        { description: 'Lunch', amountPaise: 100_000, consumerIds: ['A', 'B'] },
        { description: 'Coffee', amountPaise: 50_000, consumerIds: ['A', 'B'] },
      ],
      ['A', 'B'],
      { gstBps: 1800, scBps: 1000 },
    )

    expect(result.gstPaise).toBe(18_000 + 9_000)
    expect(result.serviceChargePaise).toBe(10_000 + 5_000)
    expect(result.totalPaise).toBe(192_000)
    expect(result.shares).toEqual({ A: 96_000, B: 96_000 })
  })

  it('distributes a line remainder to the lowest consumer ids', () => {
    const result = itemizedShares(
      [{ description: 'Snack', amountPaise: 100, consumerIds: ['C', 'A', 'B'] }],
      ['A', 'B', 'C'],
    )
    expect(result.shares).toEqual({ A: 34, B: 33, C: 33 })
  })

  it('rejects an empty bill, a zero amount, no consumers and unknown consumers', () => {
    expect(() => itemizedShares([], ['A'])).toThrow(/at least one line/)
    expect(() =>
      itemizedShares([{ description: 'X', amountPaise: 0, consumerIds: ['A'] }], ['A']),
    ).toThrow(TypeError)
    expect(() =>
      itemizedShares([{ description: 'X', amountPaise: 100, consumerIds: [] }], ['A']),
    ).toThrow(/at least one consumer/)
    expect(() =>
      itemizedShares([{ description: 'X', amountPaise: 100, consumerIds: ['Z'] }], ['A']),
    ).toThrow(/not a participant/)
  })
})
