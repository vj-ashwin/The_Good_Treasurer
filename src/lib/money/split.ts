/**
 * Split arithmetic over integer paise.
 *
 * These are arithmetic primitives only. The allocation model for the app — which expenses
 * count as shared, how participants are weighted, and what a "split" means for a trip —
 * is deliberately not decided here. Model decisions belong to the product owner.
 */

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
    throw new TypeError(`splitEvenly expects a non-negative integer part count, received ${String(parts)}`)
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
