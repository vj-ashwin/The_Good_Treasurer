import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { billTotals, finalizeExpense } from './expense'
import { splitEqual, type LineItemInput, type Shares } from './split'
import { sumPaise } from './paise'

const personId = fc.uuid()
const people = fc.uniqueArray(personId, { minLength: 1, maxLength: 8 })
const base = fc.integer({ min: 1, max: 1_000_000_000 })
const rate = fc.integer({ min: 0, max: 10_000 })

/** Invariants every finalized expense must satisfy, whatever the mode. */
function expectConserved(
  shares: Shares,
  totals: { basePaise: number; gstPaise: number; serviceChargePaise: number; totalPaise: number },
  participantIds: readonly string[],
): void {
  const values = Object.values(shares)

  expect(values).toHaveLength(participantIds.length)
  for (const id of participantIds) {
    expect(Number.isSafeInteger(shares[id])).toBe(true)
    expect(shares[id]).toBeGreaterThanOrEqual(0)
  }
  expect(sumPaise(values)).toBe(totals.totalPaise)
  expect(totals.totalPaise).toBe(
    totals.basePaise + totals.gstPaise + totals.serviceChargePaise,
  )
}

describe('finalizeExpense properties — equal', () => {
  it('property: an equal split conserves the tax-inclusive total to the paise', () => {
    fc.assert(
      fc.property(base, rate, rate, people, (amount, gst, sc, ids) => {
        const result = finalizeExpense({
          mode: 'equal',
          baseAmountPaise: amount,
          gstBps: gst,
          scBps: sc,
          participantIds: ids,
        })
        expectConserved(result.shares, result, ids)
      }),
    )
  })

  it('property: equal shares differ by at most one paise', () => {
    fc.assert(
      fc.property(base, rate, rate, people, (amount, gst, sc, ids) => {
        const values = Object.values(
          finalizeExpense({
            mode: 'equal',
            baseAmountPaise: amount,
            gstBps: gst,
            scBps: sc,
            participantIds: ids,
          }).shares,
        )
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      }),
    )
  })

  it('property: the result does not depend on the order participants were ticked', () => {
    fc.assert(
      fc.property(base, people, (amount, ids) => {
        const forwards = finalizeExpense({
          mode: 'equal',
          baseAmountPaise: amount,
          participantIds: ids,
        }).shares
        const backwards = finalizeExpense({
          mode: 'equal',
          baseAmountPaise: amount,
          participantIds: [...ids].reverse(),
        }).shares
        expect(backwards).toEqual(forwards)
      }),
    )
  })
})

describe('finalizeExpense properties — exact', () => {
  it('property: accepted exact shares conserve the total exactly', () => {
    fc.assert(
      fc.property(base, rate, rate, people, (amount, gst, sc, ids) => {
        const totals = billTotals(amount, gst, sc)
        // A split of the total is by construction a valid exact split, so the
        // only way this fails is if finalizeExpense loses or invents paise.
        const exactShares = splitEqual(totals.totalPaise, ids)
        const result = finalizeExpense({
          mode: 'exact',
          baseAmountPaise: amount,
          gstBps: gst,
          scBps: sc,
          participantIds: ids,
          exactShares,
        })

        expectConserved(result.shares, result, ids)
        expect(result.shares).toEqual(exactShares)
      }),
    )
  })
})

describe('finalizeExpense properties — itemized', () => {  const lines = fc
    .array(
      fc.record({
        description: fc.string({ minLength: 1, maxLength: 20 }),
        amountPaise: fc.integer({ min: 1, max: 100_000 }),
      }),
      { minLength: 1, maxLength: 6 },
    )
    .chain((records) =>
      fc
        .array(
          fc.uniqueArray(personId, { minLength: 1, maxLength: 4 }),
          { minLength: records.length, maxLength: records.length },
        )
        .map((consumerLists) =>
          records.map((record, index): LineItemInput => ({
            ...record,
            consumerIds: consumerLists[index],
          })),
        ),
    )

  it('property: line items conserve the grand total to the paise', () => {
    fc.assert(
      fc.property(lines, rate, rate, (lineItems, gst, sc) => {
        const participantIds = [...new Set(lineItems.flatMap((line) => line.consumerIds))]
        const baseAmountPaise = sumPaise(lineItems.map((line) => line.amountPaise))
        const result = finalizeExpense({
          mode: 'itemized',
          baseAmountPaise,
          gstBps: gst,
          scBps: sc,
          participantIds,
          lineItems,
        })

        expectConserved(result.shares, result, participantIds)
        expect(result.lineItems).toHaveLength(lineItems.length)
      }),
    )
  })

  it('property: stored per-line tax sums to the stored tax totals', () => {
    fc.assert(
      fc.property(lines, rate, rate, (lineItems, gst, sc) => {
        const participantIds = [...new Set(lineItems.flatMap((line) => line.consumerIds))]
        const baseAmountPaise = sumPaise(lineItems.map((line) => line.amountPaise))
        const result = finalizeExpense({
          mode: 'itemized',
          baseAmountPaise,
          gstBps: gst,
          scBps: sc,
          participantIds,
          lineItems,
        })

        const stored = result.lineItems ?? []
        expect(sumPaise(stored.map((line) => line.gstAmountPaise))).toBe(result.gstPaise)
        expect(sumPaise(stored.map((line) => line.serviceChargeAmountPaise))).toBe(
          result.serviceChargePaise,
        )
        expect(sumPaise(stored.map((line) => line.amountPaise))).toBe(result.basePaise)
      }),
    )
  })
})

describe('finalizeExpense properties — fixed tax', () => {
  /** A fixed amount that fits inside a safe integer total, coin by coin. */
  const fixedTax = fc.integer({ min: 0, max: 1_000_000 })

  it('property: a fixed GST amount is stored verbatim and conserves the total', () => {
    fc.assert(
      fc.property(base, fixedTax, rate, people, (amount, gstAmount, sc, ids) => {
        const result = finalizeExpense({
          mode: 'equal',
          baseAmountPaise: amount,
          gstBps: 9999, // must be ignored: the fixed amount wins
          scBps: sc,
          gstAmountPaise: gstAmount,
          participantIds: ids,
        })
        expect(result.gstPaise).toBe(gstAmount)
        expectConserved(result.shares, result, ids)
      }),
    )
  })

  it('property: a CGST/SGST/IGST split always sums to the stored GST', () => {
    fc.assert(
      fc.property(base, fixedTax, fixedTax, fixedTax, people, (amount, cgst, sgst, igst, ids) => {
        const gstAmount = cgst + sgst + igst
        const result = finalizeExpense({
          mode: 'equal',
          baseAmountPaise: amount,
          gstAmountPaise: gstAmount,
          gstParts: { cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst },
          participantIds: ids,
        })

        const parts = result.gstParts
        expect(parts).not.toBeNull()
        expect((parts?.cgstPaise ?? 0) + (parts?.sgstPaise ?? 0) + (parts?.igstPaise ?? 0)).toBe(
          result.gstPaise,
        )
        expectConserved(result.shares, result, ids)
      }),
    )
  })

  it('property: an exact split over a fixed tax still conserves the total', () => {
    fc.assert(
      fc.property(base, fixedTax, rate, people, (amount, gstAmount, sc, ids) => {
        const totals = billTotals(amount, null, sc, gstAmount)
        const exactShares = splitEqual(totals.totalPaise, ids)
        const result = finalizeExpense({
          mode: 'exact',
          baseAmountPaise: amount,
          gstAmountPaise: gstAmount,
          scBps: sc,
          participantIds: ids,
          exactShares,
        })

        expect(result.gstPaise).toBe(gstAmount)
        expectConserved(result.shares, result, ids)
      }),
    )
  })
})
