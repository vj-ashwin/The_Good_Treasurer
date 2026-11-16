import { describe, expect, it } from 'vitest'
import { pdfMoney, reportFileBase } from './shared'

describe('reportFileBase', () => {
  it('builds a safe base name from the trip and the export date', () => {
    expect(
      reportFileBase({ tripName: 'Goa 2026!', generatedAt: Date.UTC(2026, 10, 16, 12) }),
    ).toBe('goa-2026-settlement-2026-11-16')
  })

  it('falls back to "trip" when the name has no usable characters', () => {
    expect(
      reportFileBase({ tripName: '   ', generatedAt: Date.UTC(2026, 0, 2) }),
    ).toBe('trip-settlement-2026-01-02')
  })

  it('collapses runs of punctuation and trims dashes', () => {
    expect(
      reportFileBase({ tripName: '  --Kerela / Backwaters--  ', generatedAt: Date.UTC(2026, 5, 1) }),
    ).toBe('kerela-backwaters-settlement-2026-06-01')
  })
})

describe('pdfMoney', () => {
  it('uses "Rs" because the PDF font has no rupee glyph', () => {
    expect(pdfMoney(123_456)).toBe('Rs 1,234.56')
    expect(pdfMoney(-50_000)).toBe('-Rs 500.00')
  })
})
