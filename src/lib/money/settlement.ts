/**
 * Minimal-transfer settlement over integer paise.
 *
 * Greedy, exactly as PRD OQ3 specifies: match the largest creditor with the largest
 * debtor, repeat. Pure — the input balances are never mutated, so calling this twice
 * returns the same transfers and a re-render cannot silently produce an empty list.
 */

import { comparePersonIds } from './ids'

export interface BalanceForSettlement {
  personId: string
  netPaise: number
}

export interface Transfer {
  /** The person paying. */
  from: string
  /** The person receiving. */
  to: string
  amountPaise: number
}

interface Remaining {
  personId: string
  amountPaise: number
}

function requireNet(value: number, personId: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`netPaise for ${personId} must be integer paise, received ${String(value)}`)
  }
  return value
}

/**
 * Transfers that settle the balances.
 *
 * Positive `netPaise` is a creditor, negative is a debtor. Both sides are ordered by
 * size descending (ties by person id ascending), which is what makes the output stable
 * and matches the worked example in `docs/LOGIC.md` §3.2.
 */
export function calculateSettlement(balances: readonly BalanceForSettlement[]): Transfer[] {
  const creditors: Remaining[] = []
  const debtors: Remaining[] = []
  let difference = 0n

  for (const balance of balances) {
    const net = requireNet(balance.netPaise, balance.personId)
    difference += BigInt(net)
    if (net > 0) creditors.push({ personId: balance.personId, amountPaise: net })
    if (net < 0) debtors.push({ personId: balance.personId, amountPaise: -net })
  }

  // Settling an unbalanced set would invent or destroy money. The caller checks
  // `balanceDifferencePaise` first and shows a data warning instead.
  if (difference !== 0n) {
    throw new Error('Balances must sum to zero before they can be settled')
  }

  creditors.sort(
    (left, right) =>
      right.amountPaise - left.amountPaise || comparePersonIds(left.personId, right.personId),
  )
  debtors.sort(
    (left, right) =>
      right.amountPaise - left.amountPaise || comparePersonIds(left.personId, right.personId),
  )

  const transfers: Transfer[] = []
  let creditorIndex = 0
  let debtorIndex = 0

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const amountPaise = Math.min(creditor.amountPaise, debtor.amountPaise)

    if (amountPaise > 0) {
      transfers.push({ from: debtor.personId, to: creditor.personId, amountPaise })
    }

    creditor.amountPaise -= amountPaise
    debtor.amountPaise -= amountPaise
    if (creditor.amountPaise === 0) creditorIndex += 1
    if (debtor.amountPaise === 0) debtorIndex += 1
  }

  return transfers
}
