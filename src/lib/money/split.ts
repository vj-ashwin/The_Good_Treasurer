/**
 * Split allocation over integer paise.
 *
 * The allocation model is fixed by `docs/LOGIC.md` §2 and PRD OQ1/OQ2:
 *
 * - `equal`   — the whole bill, tax included, split across the participants.
 * - `exact`   — the organiser supplies each share and the shares must sum to the bill.
 * - `itemized` — each line item is split across its consumers, and tax is calculated
 *                per line item and split the same way.
 *
 * Every share map is `Record<personId, paise>`: the shape Firestore stores. Every
 * function is pure and conserves the total to the paise.
 */

import { calcTaxPaise } from './tax'
import { comparePersonIds } from './ids'

/** A share map keyed by person id. */
export type Shares = Record<string, number>

/** One line of an itemized bill. */
export interface LineItemInput {
  description: string
  amountPaise: number
  consumerIds: readonly string[]
  /**
   * Rate for this line, overriding the bill-level rate. `0` means the line is
   * untaxed; `null`/`undefined` means "use the bill-level rate".
   */
  gstBps?: number | null
  scBps?: number | null
}

/** Bill-level tax rates, applied to any line that does not override them. */
export interface TaxRates {
  gstBps?: number | null
  scBps?: number | null
}

/** Shares plus the stored money fields for an itemized expense. */
export interface ItemizedResult {
  shares: Shares
  basePaise: number
  gstPaise: number
  serviceChargePaise: number
  totalPaise: number
}

/**
 * Splits an integer paise total into `parts` integer shares that sum back to the total
 * exactly, with no paise created or lost.
 *
 * The distribution is deterministic: the first `total % parts` shares receive one extra
 * paise. For a negative total the extra paise is distributed so that the shares stay as
 * close together as possible, mirroring the positive case.
 *
 * Returns an empty array for `parts === 0`. Throws on a non-integer total or a negative
 * part count.
 */
export function splitEvenly(totalPaise: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalPaise)) {
    throw new TypeError(`splitEvenly expects integer paise, received ${String(totalPaise)}`)
  }
  if (!Number.isSafeInteger(parts) || parts < 0) {
    throw new TypeError(
      `splitEvenly expects a non-negative integer part count, received ${String(parts)}`,
    )
  }
  if (parts === 0) return []

  // BigInt keeps the division and remainder exact for every input, with no float step.
  const total = BigInt(totalPaise)
  const count = BigInt(parts)

  let quotient = total / count
  let remainder = total % count
  if (remainder < 0n) {
    quotient -= 1n
    remainder += count
  }

  const base = Number(quotient)
  const extra = Number(remainder)

  const shares: number[] = []
  for (let index = 0; index < parts; index += 1) {
    shares.push(index < extra ? base + 1 : base)
  }
  return shares
}

/**
 * Participant ids in the order remainders are handed out: ascending id.
 *
 * Ordering by id rather than by selection order is what makes a split reproducible
 * on a different device, or after a re-render, when a remainder paise has to land on
 * exactly one person.
 */
function orderIds(participantIds: readonly string[]): string[] {
  if (participantIds.length === 0) {
    throw new TypeError('a split needs at least one participant')
  }
  const seen = new Set<string>()
  for (const id of participantIds) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(`participant ids must be non-empty strings, received ${String(id)}`)
    }
    if (seen.has(id)) {
      throw new TypeError(`duplicate participant ${id}`)
    }
    seen.add(id)
  }
  return [...participantIds].sort(comparePersonIds)
}

function distribute(totalPaise: number, orderedIds: readonly string[]): Map<string, number> {
  const parts = splitEvenly(totalPaise, orderedIds.length)
  const result = new Map<string, number>()
  orderedIds.forEach((id, index) => {
    result.set(id, parts[index])
  })
  return result
}

function toShares(amounts: Map<string, number>): Shares {
  const shares: Shares = {}
  for (const [id, amount] of amounts) shares[id] = amount
  return shares
}

/**
 * Equal split of `totalPaise` across the participants, largest-remainder style.
 *
 * The extra paise go to the lowest person ids, so the result depends only on the
 * participant set, never on the order the organiser ticked them in.
 */
export function splitEqual(totalPaise: number, participantIds: readonly string[]): Shares {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) {
    throw new TypeError(
      `splitEqual expects non-negative integer paise, received ${String(totalPaise)}`,
    )
  }
  return toShares(distribute(totalPaise, orderIds(participantIds)))
}

/**
 * Validates an organiser-supplied exact split and returns it keyed the same way.
 *
 * Throws unless every participant has exactly one share, every share is a
 * non-negative integer, and the shares sum to `totalPaise`.
 */
export function splitExact(
  input: Readonly<Record<string, number>>,
  totalPaise: number,
  participantIds: readonly string[],
): Shares {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) {
    throw new TypeError(
      `splitExact expects non-negative integer paise, received ${String(totalPaise)}`,
    )
  }
  const ordered = orderIds(participantIds)

  const inputIds = Object.keys(input).sort(comparePersonIds)
  const expectedIds = [...ordered].sort(comparePersonIds)
  if (inputIds.length !== expectedIds.length) {
    throw new Error('Exact split must give every participant exactly one share')
  }
  for (let index = 0; index < expectedIds.length; index += 1) {
    if (inputIds[index] !== expectedIds[index]) {
      throw new Error('Exact split must give every participant exactly one share')
    }
  }

  let sum = 0n
  for (const id of ordered) {
    const share = input[id]
    if (!Number.isSafeInteger(share) || share < 0) {
      throw new TypeError(`share for ${id} must be non-negative integer paise`)
    }
    sum += BigInt(share)
  }
  if (sum !== BigInt(totalPaise)) {
    throw new Error('Exact split must sum to the total bill')
  }

  const shares: Shares = {}
  for (const id of ordered) shares[id] = input[id]
  return shares
}

/**
 * Itemized split: each line item is divided across its consumers and taxed at its own
 * rate, falling back to the bill-level rate. Totals are the sums of the line values, so
 * `totalPaise === basePaise + gstPaise + serviceChargePaise` always holds.
 */
export function itemizedShares(
  lineItems: readonly LineItemInput[],
  participantIds: readonly string[],
  rates: TaxRates = {},
): ItemizedResult {
  const ordered = orderIds(participantIds)
  const participantSet = new Set(ordered)
  if (lineItems.length === 0) {
    throw new Error('An itemized bill needs at least one line item')
  }

  const amounts = new Map<string, number>(ordered.map((id) => [id, 0]))
  let basePaise = 0n
  let gstPaise = 0n
  let serviceChargePaise = 0n

  for (const item of lineItems) {
    if (!Number.isSafeInteger(item.amountPaise) || item.amountPaise <= 0) {
      throw new TypeError('Line item amounts must be positive integer paise')
    }
    if (item.consumerIds.length === 0) {
      throw new Error('A line item needs at least one consumer')
    }
    const consumers = orderIds(item.consumerIds)
    for (const consumer of consumers) {
      if (!participantSet.has(consumer)) {
        throw new Error(`Line item consumer ${consumer} is not a participant`)
      }
    }

    const gstBps = item.gstBps ?? rates.gstBps ?? 0
    const scBps = item.scBps ?? rates.scBps ?? 0
    const lineGst = calcTaxPaise(item.amountPaise, gstBps)
    const lineSc = calcTaxPaise(item.amountPaise, scBps)

    const baseParts = distribute(item.amountPaise, consumers)
    const gstParts = distribute(lineGst, consumers)
    const scParts = distribute(lineSc, consumers)

    for (const consumer of consumers) {
      const current = amounts.get(consumer) ?? 0
      const share = (baseParts.get(consumer) ?? 0) + (gstParts.get(consumer) ?? 0) + (scParts.get(consumer) ?? 0)
      amounts.set(consumer, current + share)
    }

    basePaise += BigInt(item.amountPaise)
    gstPaise += BigInt(lineGst)
    serviceChargePaise += BigInt(lineSc)
  }

  const base = Number(basePaise)
  const gst = Number(gstPaise)
  const serviceCharge = Number(serviceChargePaise)

  return {
    shares: toShares(amounts),
    basePaise: base,
    gstPaise: gst,
    serviceChargePaise: serviceCharge,
    totalPaise: base + gst + serviceCharge,
  }
}
