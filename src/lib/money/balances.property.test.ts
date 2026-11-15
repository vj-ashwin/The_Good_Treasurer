import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { balanceDifferencePaise, computeBalances, type ExpenseForBalance } from './balances'
import { splitEqual } from './split'
import { calcTaxPaise } from './tax'

const idsArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 4 })
  .map((numbers) => numbers.map((number) => `p${number}`))

/**
 * Expenses whose shares genuinely sum to the bill — the precondition the balances
 * invariant depends on.
 */
function expensesArb(ids: readonly string[]) {
  return fc
    .array(
      fc.record({
        participants: fc.uniqueArray(fc.constantFrom(...ids), {
          minLength: 1,
          maxLength: ids.length,
        }),
        baseAmountPaise: fc.integer({ min: 0, max: 1_000_000 }),
        gstBps: fc.integer({ min: 0, max: 10_000 }),
        scBps: fc.integer({ min: 0, max: 10_000 }),
        deleted: fc.boolean(),
      }),
      { maxLength: 5 },
    )
    .map((rows): ExpenseForBalance[] =>
      rows.map((row) => {
        const gstAmountPaise = calcTaxPaise(row.baseAmountPaise, row.gstBps)
        const serviceChargeAmountPaise = calcTaxPaise(row.baseAmountPaise, row.scBps)
        const totalPaise = row.baseAmountPaise + gstAmountPaise + serviceChargeAmountPaise
        return {
          payerId: row.participants[0],
          baseAmountPaise: row.baseAmountPaise,
          gstAmountPaise,
          serviceChargeAmountPaise,
          shares: splitEqual(totalPaise, row.participants),
          deletedAt: row.deleted ? 1 : null,
        }
      }),
    )
}

describe('computeBalances properties', () => {
  it('property: balances always sum to zero', () => {
    fc.assert(
      fc.property(
        idsArb.chain((ids) => fc.tuple(fc.constant(ids), expensesArb(ids))),
        ([ids, expenses]) => {
          const balances = computeBalances(
            expenses,
            ids.map((id) => ({ id, name: id.toUpperCase() })),
          )
          expect(balanceDifferencePaise(balances)).toBe(0)
        },
      ),
    )
  })

  it('property: every net balance is paid minus share', () => {
    fc.assert(
      fc.property(
        idsArb.chain((ids) => fc.tuple(fc.constant(ids), expensesArb(ids))),
        ([ids, expenses]) => {
          for (const balance of computeBalances(
            expenses,
            ids.map((id) => ({ id, name: id.toUpperCase() })),
          )) {
            expect(balance.netPaise).toBe(balance.paidPaise - balance.sharePaise)
          }
        },
      ),
    )
  })

  it('property: a participant missing from the trip does not unbalance the ledger', () => {
    // The report must survive a hard-deleted person: the id is still accounted for.
    fc.assert(
      fc.property(
        idsArb.chain((ids) => fc.tuple(fc.constant(ids), expensesArb(ids))),
        ([ids, expenses]) => {
          const survivors = ids.slice(1).map((id) => ({ id, name: id.toUpperCase() }))
          expect(balanceDifferencePaise(computeBalances(expenses, survivors))).toBe(0)
        },
      ),
    )
  })
})
