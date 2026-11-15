import { describe, expect, it } from 'vitest'
import { formatPaise, isPaise, parsePaise, sumPaise } from './paise'

describe('parsePaise', () => {
  it('reads whole rupees as paise', () => {
    expect(parsePaise('100')).toBe(10_000)
    expect(parsePaise('0')).toBe(0)
    expect(parsePaise('1')).toBe(100)
  })

  it('reads one or two decimal places', () => {
    expect(parsePaise('100.50')).toBe(10_050)
    expect(parsePaise('100.5')).toBe(10_050)
    expect(parsePaise('100.05')).toBe(10_005)
    expect(parsePaise('.5')).toBe(50)
    expect(parsePaise('12.')).toBe(1_200)
  })

  it('rejects more than two decimal places rather than rounding', () => {
    expect(parsePaise('100.505')).toBeNull()
    expect(parsePaise('0.001')).toBeNull()
  })

  it('accepts the rupee sign, digit grouping and whitespace', () => {
    expect(parsePaise('₹1,20,000.50')).toBe(12_000_050)
    expect(parsePaise('1 200')).toBe(120_000)
    expect(parsePaise('  ₹10.25  ')).toBe(1_025)
  })

  it('reads a leading sign', () => {
    expect(parsePaise('-25.50')).toBe(-2_550)
    expect(parsePaise('+25.50')).toBe(2_550)
  })

  it('rejects input that is not an amount', () => {
    expect(parsePaise('')).toBeNull()
    expect(parsePaise('abc')).toBeNull()
    expect(parsePaise('.')).toBeNull()
    expect(parsePaise('1.2.3')).toBeNull()
    expect(parsePaise('1e5')).toBeNull()
  })

  it('rejects magnitudes it cannot represent exactly', () => {
    expect(parsePaise('99999999999999999999')).toBeNull()
  })
})

describe('formatPaise', () => {
  it('formats whole and fractional rupee amounts', () => {
    expect(formatPaise(0)).toBe('₹0.00')
    expect(formatPaise(100)).toBe('₹1.00')
    expect(formatPaise(5)).toBe('₹0.05')
    expect(formatPaise(123_456)).toBe('₹1,234.56')
  })

  it('groups thousands using the Indian lakh/crore convention', () => {
    expect(formatPaise(1_234_567)).toBe('₹12,345.67')
    expect(formatPaise(12_345_678)).toBe('₹1,23,456.78')
    expect(formatPaise(123_456_789)).toBe('₹12,34,567.89')
  })

  it('formats negative amounts', () => {
    expect(formatPaise(-5_050)).toBe('-₹50.50')
  })

  it('is total: bad input degrades to zero instead of throwing', () => {
    expect(formatPaise(Number.NaN)).toBe('₹0.00')
    expect(formatPaise(Number.POSITIVE_INFINITY)).toBe('₹0.00')
    expect(formatPaise(12.9)).toBe('₹0.12')
  })
})

describe('isPaise', () => {
  it('accepts only safe integers', () => {
    expect(isPaise(0)).toBe(true)
    expect(isPaise(-100)).toBe(true)
    expect(isPaise(12.5)).toBe(false)
    expect(isPaise('100')).toBe(false)
    expect(isPaise(Number.NaN)).toBe(false)
    expect(isPaise(Number.MAX_SAFE_INTEGER + 2)).toBe(false)
  })
})

describe('sumPaise', () => {
  it('adds amounts exactly', () => {
    expect(sumPaise([])).toBe(0)
    expect(sumPaise([100, 250])).toBe(350)
    expect(sumPaise([-100, 250])).toBe(150)
  })

  it('rejects a non-integer amount loudly', () => {
    expect(() => sumPaise([100, 12.5])).toThrow(TypeError)
  })

  it('rejects a total beyond the safe integer range', () => {
    expect(() => sumPaise([Number.MAX_SAFE_INTEGER, 2])).toThrow(RangeError)
  })
})
