import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { formatPaise, isPaise, parsePaise, sumPaise } from './paise'

/** Amounts small enough that sums stay inside the safe integer range. */
const safeAmount = fc.integer({ min: 0, max: 1_000_000_000 })

describe('paise properties', () => {
  it('property: formatting an amount and parsing it back returns the same paise', () => {
    fc.assert(
      fc.property(safeAmount, (paise) => {
        expect(parsePaise(formatPaise(paise))).toBe(paise)
      }),
    )
  })

  it('property: a rupee/paise pair parses to exactly that many paise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 99 }),
        (rupees, paise) => {
          const text = `${rupees}.${String(paise).padStart(2, '0')}`
          expect(parsePaise(text)).toBe(rupees * 100 + paise)
        },
      ),
    )
  })

  it('property: parsing never yields a fractional amount', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const parsed = parsePaise(text)
        if (parsed !== null) expect(isPaise(parsed)).toBe(true)
      }),
    )
  })

  it('property: an amount with more than two decimal places is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 999 }),
        (rupees, thousandths) => {
          const text = `${rupees}.${String(thousandths).padStart(3, '0')}`
          expect(parsePaise(text)).toBeNull()
        },
      ),
    )
  })

  it('property: formatting always yields two decimal places', () => {
    fc.assert(
      fc.property(safeAmount, (paise) => {
        expect(formatPaise(paise)).toMatch(/^₹[\d,]*\.\d{2}$/)
      }),
    )
  })

  it('property: formatting never throws, whatever the input', () => {
    fc.assert(
      fc.property(fc.double(), (value) => {
        expect(() => formatPaise(value)).not.toThrow()
      }),
    )
  })

  it('property: summing a list equals the sum of its parts', () => {
    fc.assert(
      fc.property(fc.array(safeAmount, { maxLength: 50 }), (amounts) => {
        const expected = amounts.reduce((total, amount) => total + amount, 0)
        expect(sumPaise(amounts)).toBe(expected)
      }),
    )
  })

  it('property: summing an empty list is zero', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(sumPaise([])).toBe(0)
      }),
    )
  })
})
