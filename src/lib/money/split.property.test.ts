import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { splitEvenly } from './split'
import { sumPaise } from './paise'

const safeAmount = fc.integer({ min: 0, max: 1_000_000_000 })
const safeParts = fc.integer({ min: 1, max: 50 })

describe('splitEvenly properties', () => {
  it('property: splitting conserves the total to the paise', () => {
    fc.assert(
      fc.property(safeAmount, safeParts, (total, parts) => {
        expect(sumPaise(splitEvenly(total, parts))).toBe(total)
      }),
    )
  })

  it('property: splitting produces exactly one share per part', () => {
    fc.assert(
      fc.property(safeAmount, safeParts, (total, parts) => {
        expect(splitEvenly(total, parts)).toHaveLength(parts)
      }),
    )
  })

  it('property: every share is an integer number of paise', () => {
    fc.assert(
      fc.property(safeAmount, safeParts, (total, parts) => {
        for (const share of splitEvenly(total, parts)) {
          expect(Number.isSafeInteger(share)).toBe(true)
        }
      }),
    )
  })

  it('property: a non-negative total never produces a negative share', () => {
    fc.assert(
      fc.property(safeAmount, safeParts, (total, parts) => {
        for (const share of splitEvenly(total, parts)) {
          expect(share).toBeGreaterThanOrEqual(0)
        }
      }),
    )
  })

  it('property: shares differ by at most one paise', () => {
    fc.assert(
      fc.property(safeAmount, safeParts, (total, parts) => {
        const shares = splitEvenly(total, parts)
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
      }),
    )
  })

  it('property: splitting into one part returns the whole amount', () => {
    fc.assert(
      fc.property(safeAmount, (total) => {
        expect(splitEvenly(total, 1)).toEqual([total])
      }),
    )
  })

  it('property: splitting is deterministic', () => {
    fc.assert(
      fc.property(safeAmount, safeParts, (total, parts) => {
        expect(splitEvenly(total, parts)).toEqual(splitEvenly(total, parts))
      }),
    )
  })

  it('property: splitting a negative total conserves the total', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: -1 }), safeParts, (total, parts) => {
        expect(sumPaise(splitEvenly(total, parts))).toBe(total)
      }),
    )
  })
})
