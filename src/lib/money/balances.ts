/**
 * Paid-vs-share balance computation over integer paise.
 *
 * Every expense credits its payer with the full bill and debits each participant by
 * their share, so the sum of all balances is always zero when the shares of each
 * expense sum to that expense's total. That is the invariant the property tests check.
 *
 * The function deliberately does not throw when a share references a person who is no
 * longer in the trip: dropping the hard failure is what keeps an old report readable
 * ("Removed person") instead of permanently broken. Callers that care can check
 * `balanceDifferencePaise` and show a data warning.
 */

import { comparePersonIds } from './ids'

export interface ExpenseForBalance {
  payerId: string
  baseAmountPaise: number
  gstAmountPaise: number
  serviceChargeAmountPaise: number
  shares: Readonly<Record<string, number>>
  /** Any non-null value means the expense is soft-deleted and excluded. */
  deletedAt?: unknown
}

export interface PersonForBalance {
  id: string
  name: string
  /** Any non-null value means the person is retired and excluded from balances. */
  deletedAt?: unknown
}

export interface PersonBalance {
  personId: string
  /** `null` when the id is referenced by an expense but no longer in `people`. */
  name: string | null
  paidPaise: number
  sharePaise: number
  netPaise: number
}

function requirePaise(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be integer paise, received ${String(value)}`)
  }
  return BigInt(value)
}

function orderUnknownIds(ids: Iterable<string>): string[] {
  return [...ids].sort(comparePersonIds)
}

/**
 * Balances for every person in the trip, plus anyone still referenced by an expense.
 *
 * Positive `netPaise` means the person is owed money; negative means they owe it.
 */
export function computeBalances(
  expenses: readonly ExpenseForBalance[],
  people: readonly PersonForBalance[],
): PersonBalance[] {
  const paid = new Map<string, bigint>()
  const share = new Map<string, bigint>()

  for (const expense of expenses) {
    if (expense.deletedAt !== null && expense.deletedAt !== undefined) continue

    const total =
      requirePaise(expense.baseAmountPaise, 'baseAmountPaise') +
      requirePaise(expense.gstAmountPaise, 'gstAmountPaise') +
      requirePaise(expense.serviceChargeAmountPaise, 'serviceChargeAmountPaise')
    paid.set(expense.payerId, (paid.get(expense.payerId) ?? 0n) + total)

    for (const [personId, sharePaise] of Object.entries(expense.shares)) {
      requirePaise(sharePaise, `share for ${personId}`)
      share.set(personId, (share.get(personId) ?? 0n) + BigInt(sharePaise))
    }
  }

  const names = new Map<string, string>()
  const retired = new Set<string>()
  for (const person of people) {
    names.set(person.id, person.name)
    if (person.deletedAt !== null && person.deletedAt !== undefined) retired.add(person.id)
  }

  const knownIds = people
    .filter((person) => !retired.has(person.id))
    .map((person) => person.id)
  const unknownIds = orderUnknownIds(
    new Set(
      [...paid.keys(), ...share.keys()].filter(
        (personId) => !names.has(personId) && !retired.has(personId),
      ),
    ),
  )

  const balances: PersonBalance[] = []
  for (const personId of [...knownIds, ...unknownIds]) {
    const paidPaise = Number(paid.get(personId) ?? 0n)
    const sharePaise = Number(share.get(personId) ?? 0n)
    balances.push({
      personId,
      name: names.get(personId) ?? null,
      paidPaise,
      sharePaise,
      netPaise: paidPaise - sharePaise,
    })
  }
  return balances
}

/**
 * Sum of every net balance. Zero means the data is internally consistent; anything
 * else means a stored expense is corrupt (for example shares that do not sum to the
 * bill). Display code uses this to show a warning rather than crashing.
 */
export function balanceDifferencePaise(balances: readonly PersonBalance[]): number {
  let total = 0n
  for (const balance of balances) {
    requirePaise(balance.netPaise, `netPaise for ${balance.personId}`)
    total += BigInt(balance.netPaise)
  }
  return Number(total)
}
