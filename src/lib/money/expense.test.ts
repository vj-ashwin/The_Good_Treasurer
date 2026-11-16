import { describe, expect, it } from 'vitest'
import { billTotals, finalizeExpense } from './expense'
import type { LineItemInput } from './split'
import { sumPaise } from './paise'

// Fixed ids keep the expectations readable. The money module never looks at
// names: only ids, so any stable strings would do.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('billTotals', () => {
  it('matches the CUJ 2 dinner numbers', () => {
    // ₹3,200 + 18% GST + 10% service charge = ₹4,096
    expect(billTotals(320_000, 1800, 1000)).toEqual({
      basePaise: 320_000,
      gstPaise: 57_600,
      serviceChargePaise: 32_000,
      totalPaise: 409_600,
    })
  })

  it('treats null and undefined rates as no tax', () => {
    expect(billTotals(150_000, null, null)).toEqual({
      basePaise: 150_000,
      gstPaise: 0,
      serviceChargePaise: 0,
      totalPaise: 150_000,
    })
  })

  it('always keeps total = base + gst + service charge', () => {
    const totals = billTotals(100_001, 1800, 1000)
    expect(totals.totalPaise).toBe(
      totals.basePaise + totals.gstPaise + totals.serviceChargePaise,
    )
  })

  it('rejects a zero, negative or fractional base', () => {
    expect(() => billTotals(0)).toThrow(TypeError)
    expect(() => billTotals(-1)).toThrow(TypeError)
    expect(() => billTotals(12.5)).toThrow(TypeError)
  })

  it('rejects a rate outside 0..10000 bps', () => {
    expect(() => billTotals(100, 10_001)).toThrow(TypeError)
    expect(() => billTotals(100, -1)).toThrow(TypeError)
  })

  it('uses a fixed GST amount instead of the rate (PRD G3 rupee entry)', () => {
    // The organiser read "GST ₹250" straight off the bill.
    expect(billTotals(100_000, 1800, 0, 25_000)).toEqual({
      basePaise: 100_000,
      gstPaise: 25_000,
      serviceChargePaise: 0,
      totalPaise: 125_000,
    })
  })

  it('uses a fixed service-charge amount instead of the rate', () => {
    expect(billTotals(100_000, 0, 1000, null, 7_500)).toEqual({
      basePaise: 100_000,
      gstPaise: 0,
      serviceChargePaise: 7_500,
      totalPaise: 107_500,
    })
  })

  it('accepts a zero fixed amount as "no tax"', () => {
    expect(billTotals(100_000, 1800, 0, 0)).toEqual({
      basePaise: 100_000,
      gstPaise: 0,
      serviceChargePaise: 0,
      totalPaise: 100_000,
    })
  })

  it('rejects a negative or fractional fixed amount', () => {
    expect(() => billTotals(100_000, 0, 0, -1)).toThrow(TypeError)
    expect(() => billTotals(100_000, 0, 0, 12.5)).toThrow(TypeError)
    expect(() => billTotals(100_000, 0, 0, null, -1)).toThrow(TypeError)
  })
})

describe('finalizeExpense — GST parts', () => {
  it('stores a CGST/SGST/IGST split that adds up to the fixed GST', () => {
    const result = finalizeExpense({
      mode: 'equal',
      baseAmountPaise: 100_000,
      gstAmountPaise: 18_000,
      gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
      participantIds: [A, B],
    })

    expect(result.gstPaise).toBe(18_000)
    expect(result.totalPaise).toBe(118_000)
    expect(result.gstParts).toEqual({ cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 })
    expect(result.shares).toEqual({ [A]: 59_000, [B]: 59_000 })
  })

  it('supports an inter-state IGST-only bill', () => {
    const result = finalizeExpense({
      mode: 'equal',
      baseAmountPaise: 200_000,
      gstAmountPaise: 36_000,
      gstParts: { cgstPaise: 0, sgstPaise: 0, igstPaise: 36_000 },
      participantIds: [A],
    })

    expect(result.gstParts?.igstPaise).toBe(36_000)
    expect(result.totalPaise).toBe(236_000)
  })

  it('rejects parts that do not add up to the GST amount', () => {
    expect(() =>
      finalizeExpense({
        mode: 'equal',
        baseAmountPaise: 100_000,
        gstAmountPaise: 18_000,
        gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 1 },
        participantIds: [A],
      }),
    ).toThrow(/add up to the GST amount/)
  })

  it('rejects parts without a total GST amount to split', () => {
    expect(() =>
      finalizeExpense({
        mode: 'equal',
        baseAmountPaise: 100_000,
        gstParts: { cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
        participantIds: [A],
      }),
    ).toThrow(/GST amount/)
  })

  it('rejects a negative part', () => {
    expect(() =>
      finalizeExpense({
        mode: 'equal',
        baseAmountPaise: 100_000,
        gstAmountPaise: 18_000,
        gstParts: { cgstPaise: 20_000, sgstPaise: -2_000, igstPaise: 0 },
        participantIds: [A],
      }),
    ).toThrow(TypeError)
  })

  it('rejects a fixed tax or GST parts on an itemized bill', () => {
    expect(() =>
      finalizeExpense({
        mode: 'itemized',
        baseAmountPaise: 100,
        gstAmountPaise: 18,
        participantIds: [A],
        lineItems: [{ description: 'Tea', amountPaise: 100, consumerIds: [A] }],
      }),
    ).toThrow(/itemized/)
    expect(() =>
      finalizeExpense({
        mode: 'itemized',
        baseAmountPaise: 100,
        gstAmountPaise: 18,
        gstParts: { cgstPaise: 9, sgstPaise: 9, igstPaise: 0 },
        participantIds: [A],
        lineItems: [{ description: 'Tea', amountPaise: 100, consumerIds: [A] }],
      }),
    ).toThrow(/itemized/)
  })
})

describe('finalizeExpense — equal', () => {
  it('splits CUJ 2 evenly across four people', () => {
    const result = finalizeExpense({
      mode: 'equal',
      baseAmountPaise: 320_000,
      gstBps: 1800,
      scBps: 1000,
      participantIds: [A, B, C, D],
    })

    expect(result.totalPaise).toBe(409_600)
    expect(result.shares).toEqual({ [A]: 102_400, [B]: 102_400, [C]: 102_400, [D]: 102_400 })
    expect(result.lineItems).toBeNull()
  })

  it('gives the remainder paise to the lowest ids', () => {
    const result = finalizeExpense({
      mode: 'equal',
      baseAmountPaise: 100,
      participantIds: [C, A, B],
    })

    expect(result.shares).toEqual({ [A]: 34, [B]: 33, [C]: 33 })
    expect(sumPaise(Object.values(result.shares))).toBe(result.totalPaise)
  })

  it('rejects an empty participant list', () => {
    expect(() =>
      finalizeExpense({ mode: 'equal', baseAmountPaise: 100, participantIds: [] }),
    ).toThrow(/participant/)
  })
})

describe('finalizeExpense — exact', () => {
  it('accepts the CUJ 3 taxi shares', () => {
    const result = finalizeExpense({
      mode: 'exact',
      baseAmountPaise: 150_000,
      participantIds: [A, B, C],
      exactShares: { [A]: 50_000, [B]: 60_000, [C]: 40_000 },
    })

    expect(result.totalPaise).toBe(150_000)
    expect(result.shares).toEqual({ [A]: 50_000, [B]: 60_000, [C]: 40_000 })
  })

  it('validates the shares against the tax-inclusive total', () => {
    // ₹1,500 + 18% GST = ₹1,770; the entered shares must match ₹1,770.
    const result = finalizeExpense({
      mode: 'exact',
      baseAmountPaise: 150_000,
      gstBps: 1800,
      participantIds: [A, B, C],
      exactShares: { [A]: 59_000, [B]: 70_800, [C]: 47_200 },
    })

    expect(result.gstPaise).toBe(27_000)
    expect(result.totalPaise).toBe(177_000)
  })

  it('rejects shares that do not sum to the total', () => {
    expect(() =>
      finalizeExpense({
        mode: 'exact',
        baseAmountPaise: 150_000,
        participantIds: [A, B],
        exactShares: { [A]: 50_000, [B]: 60_000 },
      }),
    ).toThrow(/sum/)
  })

  it('rejects a missing participant or an extra person', () => {
    expect(() =>
      finalizeExpense({
        mode: 'exact',
        baseAmountPaise: 150_000,
        participantIds: [A, B],
        exactShares: { [A]: 150_000 },
      }),
    ).toThrow(/every participant/)
    expect(() =>
      finalizeExpense({
        mode: 'exact',
        baseAmountPaise: 150_000,
        participantIds: [A],
        exactShares: { [A]: 100_000, [B]: 50_000 },
      }),
    ).toThrow(/every participant/)
  })

  it('requires the exact shares to be passed at all', () => {
    expect(() =>
      finalizeExpense({ mode: 'exact', baseAmountPaise: 100, participantIds: [A] }),
    ).toThrow(/exact split/)
  })
})

describe('finalizeExpense — itemized', () => {
  const groceries: LineItemInput[] = [
    { description: 'Snacks', amountPaise: 80_000, consumerIds: [A, C] },
    { description: 'Drinks', amountPaise: 60_000, consumerIds: [B, D] },
    { description: 'Shared fruit', amountPaise: 100_000, consumerIds: [A, B, C, D] },
  ]

  it('splits CUJ 4 line by line', () => {
    const result = finalizeExpense({
      mode: 'itemized',
      baseAmountPaise: 240_000,
      participantIds: [A, B, C, D],
      lineItems: groceries,
    })

    expect(result.shares).toEqual({
      [A]: 65_000,
      [B]: 55_000,
      [C]: 65_000,
      [D]: 55_000,
    })
    expect(result.totalPaise).toBe(240_000)
    expect(result.lineItems).toHaveLength(3)
    expect(result.lineItems?.every((line) => line.gstAmountPaise === 0)).toBe(true)
  })

  it('applies a line-level GST override only to that line', () => {
    const lines: LineItemInput[] = [
      { description: 'Snacks', amountPaise: 80_000, consumerIds: [A, C], gstBps: 0 },
      { description: 'Shared fruit', amountPaise: 100_000, consumerIds: [A, B, C, D] },
    ]

    const result = finalizeExpense({
      mode: 'itemized',
      baseAmountPaise: 180_000,
      gstBps: 1800,
      participantIds: [A, B, C, D],
      lineItems: lines,
    })

    // Only the fruit line is taxed: 18% of ₹1,000 = ₹180.
    expect(result.gstPaise).toBe(18_000)
    expect(result.totalPaise).toBe(198_000)
    expect(result.shares[A]).toBe(80_000 / 2 + 25_000 + 4_500)
    expect(result.lineItems?.[0].gstAmountPaise).toBe(0)
    expect(result.lineItems?.[1].gstAmountPaise).toBe(18_000)
  })

  it('stores the effective rate on every line so re-editing reproduces it', () => {
    const result = finalizeExpense({
      mode: 'itemized',
      baseAmountPaise: 240_000,
      gstBps: 1800,
      scBps: 1000,
      participantIds: [A, B, C, D],
      lineItems: groceries,
    })

    expect(result.lineItems?.every((line) => line.gstBps === 1800 && line.scBps === 1000)).toBe(
      true,
    )
  })

  it('rejects a line-item total that disagrees with the base amount', () => {
    expect(() =>
      finalizeExpense({
        mode: 'itemized',
        baseAmountPaise: 240_001,
        participantIds: [A, B, C, D],
        lineItems: groceries,
      }),
    ).toThrow(/sum to the base/)
  })

  it('rejects an empty line-item list', () => {
    expect(() =>
      finalizeExpense({ mode: 'itemized', baseAmountPaise: 0, participantIds: [A], lineItems: [] }),
    ).toThrow(/line item/)
  })

  it('rejects a consumer who is not a participant', () => {
    expect(() =>
      finalizeExpense({
        mode: 'itemized',
        baseAmountPaise: 100,
        participantIds: [A],
        lineItems: [{ description: 'Tea', amountPaise: 100, consumerIds: [A, B] }],
      }),
    ).toThrow(/not a participant/)
  })
})
