import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { calcTaxPaise } from './tax'

const baseArb = fc.integer({ min: 0, max: 100_000_000_000 })
const bpsArb = fc.integer({ min: 0, max: 10_000 })

/** Half-up rounding, written independently in BigInt. */
function referenceTax(basePaise: number, bps: number): number {
  return Number((BigInt(basePaise) * BigInt(bps) + 5_000n) / 10_000n)
}

describe('calcTaxPaise properties', () => {
  it('property: tax is never negative and never exceeds the base', () => {
    // A rate is capped at 100%, so tax can never be larger than the amount taxed.
    fc.assert(
      fc.property(baseArb, bpsArb, (base, bps) => {
        const tax = calcTaxPaise(base, bps)
        expect(Number.isSafeInteger(tax)).toBe(true)
        expect(tax).toBeGreaterThanOrEqual(0)
        expect(tax).toBeLessThanOrEqual(base)
      }),
    )
  })

  it('property: tax matches exact half-up integer arithmetic for every input', () => {
    // This is the float-drift guard: the same computation in BigInt from scratch.
    fc.assert(
      fc.property(baseArb, bpsArb, (base, bps) => {
        expect(calcTaxPaise(base, bps)).toBe(referenceTax(base, bps))
      }),
    )
  })

  it('property: tax is monotonic in the base amount', () => {
    fc.assert(
      fc.property(baseArb, baseArb, bpsArb, (base, extra, bps) => {
        expect(calcTaxPaise(base + extra, bps)).toBeGreaterThanOrEqual(calcTaxPaise(base, bps))
      }),
    )
  })

  it('property: a zero rate never produces tax', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        expect(calcTaxPaise(base, 0)).toBe(0)
      }),
    )
  })

  it('property: a 100% rate taxes exactly the whole amount', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        expect(calcTaxPaise(base, 10_000)).toBe(base)
      }),
    )
  })
})
