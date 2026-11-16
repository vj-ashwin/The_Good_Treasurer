import { describe, expect, it } from 'vitest'
import { BPS_DENOMINATOR, calcTaxPaise, isBps, parsePercentToBps } from './tax'

describe('calcTaxPaise', () => {
  it('computes the GST and service charge amounts from TESTCASES §2', () => {
    expect(calcTaxPaise(320_000, 1800)).toBe(57_600) // TC-TX-01
    expect(calcTaxPaise(320_000, 1000)).toBe(32_000) // TC-TX-02
    expect(calcTaxPaise(100_000, 1800)).toBe(18_000) // TC-TX-06
    expect(calcTaxPaise(100_000, 1000)).toBe(10_000) // TC-TX-07
    expect(calcTaxPaise(100_000, 2800)).toBe(28_000) // TC-TX-09
  })

  it('returns zero for a zero rate or a zero base', () => {
    expect(calcTaxPaise(100_000, 0)).toBe(0) // TC-TX-03b
    expect(calcTaxPaise(0, 1800)).toBe(0) // TC-TX-05b
  })

  it('rounds half-up at exactly half a paise', () => {
    // 1 paise at 50% is half a paise: the only true half-way case.
    expect(calcTaxPaise(1, 5000)).toBe(1)
    expect(calcTaxPaise(1, 4999)).toBe(0)
  })

  it('does not round when the result is already a whole paise', () => {
    expect(calcTaxPaise(10_000, 1800)).toBe(1800) // 18% of ₹100 is exactly ₹18
    expect(calcTaxPaise(10_000, 1200)).toBe(1200) // TC-TX-05
  })

  it('rounds an inexact result to the nearest paise', () => {
    expect(calcTaxPaise(100_001, 1800)).toBe(18_000) // 18,000.18 paise → 18,000 (TC-TX-08)
  })

  it('stays exact at the top of the safe integer range', () => {
    expect(calcTaxPaise(Number.MAX_SAFE_INTEGER, 10_000)).toBe(Number.MAX_SAFE_INTEGER)
    expect(calcTaxPaise(Number.MAX_SAFE_INTEGER, 1800)).toBe(
      Number(
        (BigInt(Number.MAX_SAFE_INTEGER) * 1800n + 5000n) / 10_000n,
      ),
    )
  })

  it('rejects a negative base and a rate outside 0..10000 bps', () => {
    expect(() => calcTaxPaise(-1, 1800)).toThrow(TypeError)
    expect(() => calcTaxPaise(12.5, 1800)).toThrow(TypeError)
    expect(() => calcTaxPaise(100, -1)).toThrow(TypeError)
    expect(() => calcTaxPaise(100, BPS_DENOMINATOR + 1)).toThrow(TypeError)
    expect(() => calcTaxPaise(100, 18.5)).toThrow(TypeError)
  })
})

describe('isBps', () => {
  it('accepts integer rates from 0 to 10000', () => {
    expect(isBps(0)).toBe(true)
    expect(isBps(1800)).toBe(true)
    expect(isBps(BPS_DENOMINATOR)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isBps(-1)).toBe(false)
    expect(isBps(BPS_DENOMINATOR + 1)).toBe(false)
    expect(isBps(1.5)).toBe(false)
    expect(isBps('1800')).toBe(false)
    expect(isBps(Number.NaN)).toBe(false)
  })
})

describe('parsePercentToBps', () => {
  it('parses whole percentages into basis points', () => {
    expect(parsePercentToBps('18')).toBe(1800)
    expect(parsePercentToBps('10')).toBe(1000)
    expect(parsePercentToBps('0')).toBe(0)
    expect(parsePercentToBps('100')).toBe(BPS_DENOMINATOR)
  })

  it('parses up to two decimal places exactly, without a float', () => {
    expect(parsePercentToBps('18.5')).toBe(1850)
    expect(parsePercentToBps('18.55')).toBe(1855)
    expect(parsePercentToBps('0.01')).toBe(1)
    expect(parsePercentToBps(' 5 ')).toBe(500)
  })

  it('rejects more than two decimals rather than rounding', () => {
    expect(parsePercentToBps('18.555')).toBeNull()
  })

  it('rejects negatives, values above 100% and non-numbers', () => {
    expect(parsePercentToBps('-1')).toBeNull()
    expect(parsePercentToBps('100.01')).toBeNull()
    expect(parsePercentToBps('')).toBeNull()
    expect(parsePercentToBps('abc')).toBeNull()
    expect(parsePercentToBps('.')).toBeNull()
  })
})
