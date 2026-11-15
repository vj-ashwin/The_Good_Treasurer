import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { calculateSettlement, type BalanceForSettlement, type Transfer } from './settlement'

const idsArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 6 })
  .map((numbers) => numbers.map((number) => `p${number}`))

/** Random balances that are forced to sum to zero, which settlement requires. */
const balancedArb = idsArb.chain((ids) =>
  fc
    .array(fc.integer({ min: -100_000, max: 100_000 }), {
      minLength: ids.length,
      maxLength: ids.length,
    })
    .map((nets): BalanceForSettlement[] => {
      const adjusted = [...nets]
      const sum = nets.reduce((total, net) => total + net, 0)
      const last = adjusted.length - 1
      adjusted[last] -= sum
      return ids.map((personId, index) => ({ personId, netPaise: adjusted[index] }))
    }),
)

function applyTransfers(
  balances: readonly BalanceForSettlement[],
  transfers: readonly Transfer[],
): Map<string, number> {
  const nets = new Map(balances.map((balance) => [balance.personId, balance.netPaise]))
  for (const transfer of transfers) {
    // Paying moves a debtor's net up towards zero; receiving moves a creditor's down.
    nets.set(transfer.from, (nets.get(transfer.from) ?? 0) + transfer.amountPaise)
    nets.set(transfer.to, (nets.get(transfer.to) ?? 0) - transfer.amountPaise)
  }
  return nets
}

describe('calculateSettlement properties', () => {
  it('property: the transfers settle every balance to zero', () => {
    fc.assert(
      fc.property(balancedArb, (balances) => {
        const nets = applyTransfers(balances, calculateSettlement(balances))
        for (const net of nets.values()) expect(net).toBe(0)
      }),
    )
  })

  it('property: the amount transferred equals the total owed', () => {
    fc.assert(
      fc.property(balancedArb, (balances) => {
        const transfers = calculateSettlement(balances)
        const moved = transfers.reduce((total, transfer) => total + transfer.amountPaise, 0)
        const owed = balances.reduce(
          (total, balance) => (balance.netPaise > 0 ? total + balance.netPaise : total),
          0,
        )
        expect(moved).toBe(owed)
      }),
    )
  })

  it('property: never needs more than one transfer per person minus one', () => {
    fc.assert(
      fc.property(balancedArb, (balances) => {
        const participants = new Set(balances.map((balance) => balance.personId))
        expect(calculateSettlement(balances).length).toBeLessThanOrEqual(
          Math.max(participants.size - 1, 0),
        )
      }),
    )
  })

  it('property: every transfer moves a positive amount between two different people', () => {
    fc.assert(
      fc.property(balancedArb, (balances) => {
        for (const transfer of calculateSettlement(balances)) {
          expect(transfer.amountPaise).toBeGreaterThan(0)
          expect(Number.isSafeInteger(transfer.amountPaise)).toBe(true)
          expect(transfer.from).not.toBe(transfer.to)
        }
      }),
    )
  })

  it('property: settlement is pure and deterministic', () => {
    fc.assert(
      fc.property(balancedArb, (balances) => {
        const snapshot = balances.map((balance) => ({ ...balance }))
        const first = calculateSettlement(balances)
        const second = calculateSettlement(balances)
        expect(first).toEqual(second)
        expect(balances).toEqual(snapshot)
      }),
    )
  })
})
