import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { itemizedShares, splitEqual, splitEvenly } from './split'
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

describe('splitEqual properties', () => {
  const idsArb = fc
    .uniqueArray(fc.integer({ min: 0, max: 8 }), { minLength: 1, maxLength: 5 })
    .map((numbers) => numbers.map((number) => `p${number}`))

  it('property: the shares always sum to the bill', () => {
    fc.assert(
      fc.property(safeAmount, idsArb, (total, ids) => {
        expect(sumPaise(Object.values(splitEqual(total, ids)))).toBe(total)
      }),
    )
  })

  it('property: every participant gets exactly one non-negative share', () => {
    fc.assert(
      fc.property(safeAmount, idsArb, (total, ids) => {
        const shares = splitEqual(total, ids)
        expect(Object.keys(shares).sort()).toEqual([...ids].sort())
        for (const share of Object.values(shares)) {
          expect(Number.isSafeInteger(share)).toBe(true)
          expect(share).toBeGreaterThanOrEqual(0)
        }
      }),
    )
  })

  it('property: selection order never changes the result', () => {
    fc.assert(
      fc.property(safeAmount, idsArb, (total, ids) => {
        const reversed = [...ids].reverse()
        expect(splitEqual(total, reversed)).toEqual(splitEqual(total, ids))
      }),
    )
  })
})

describe('itemizedShares properties', () => {
  const idsArb = fc
    .uniqueArray(fc.integer({ min: 0, max: 8 }), { minLength: 1, maxLength: 5 })
    .map((numbers) => numbers.map((number) => `p${number}`))

  function billArb(ids: readonly string[]) {
    return fc.record({
      amountPaise: fc.integer({ min: 1, max: 1_000_000 }),
      consumerIds: fc.uniqueArray(fc.constantFrom(...ids), {
        minLength: 1,
        maxLength: ids.length,
      }),
    })
  }

  it('property: itemized shares sum to the stored bill total', () => {
    // The invariant the Firestore rules cannot check: the shares conserve the bill.
    fc.assert(
      fc.property(
        idsArb.chain((ids) =>
          fc.record({
            gstBps: fc.integer({ min: 0, max: 10_000 }),
            scBps: fc.integer({ min: 0, max: 10_000 }),
            lines: fc.array(billArb(ids), { minLength: 1, maxLength: 4 }),
          }),
        ),
        (bill) => {
          const result = itemizedShares(
            bill.lines.map((line, index) => ({
              description: `line ${String(index)}`,
              amountPaise: line.amountPaise,
              consumerIds: line.consumerIds,
            })),
            [...new Set(bill.lines.flatMap((line) => line.consumerIds))],
            { gstBps: bill.gstBps, scBps: bill.scBps },
          )
          expect(sumPaise(Object.values(result.shares))).toBe(result.totalPaise)
          expect(result.totalPaise).toBe(
            result.basePaise + result.gstPaise + result.serviceChargePaise,
          )
        },
      ),
    )
  })

  it('property: no line item can create a negative or fractional share', () => {
    fc.assert(
      fc.property(
        idsArb.chain((ids) =>
          fc.array(billArb(ids), { minLength: 1, maxLength: 4 }),
        ),
        (lines) => {
          const result = itemizedShares(
            lines.map((line, index) => ({
              description: `line ${String(index)}`,
              amountPaise: line.amountPaise,
              consumerIds: line.consumerIds,
            })),
            [...new Set(lines.flatMap((line) => line.consumerIds))],
          )
          for (const share of Object.values(result.shares)) {
            expect(Number.isSafeInteger(share)).toBe(true)
            expect(share).toBeGreaterThanOrEqual(0)
          }
        },
      ),
    )
  })
})
