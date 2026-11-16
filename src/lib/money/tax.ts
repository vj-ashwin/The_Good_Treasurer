/**
 * Basis-point tax arithmetic over integer paise.
 *
 * 1% = 100 basis points, so 18% GST is 1800 bps. Every function here is pure and
 * integer-only: no amount ever passes through a float.
 */

import { parsePaise } from './paise'

/** Basis points in one percent. */
export const BPS_PER_PERCENT = 100

/** Basis points in 100%, and therefore the denominator for a rate. */
export const BPS_DENOMINATOR = 10_000

/** True when `value` is a usable rate: an integer from 0 to 10000 bps. */
export function isBps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= BPS_DENOMINATOR
  )
}

/**
 * Tax on `basePaise` at `bps`, rounded half-up to the nearest paise.
 *
 * The rule is `floor((base × bps + 5000) / 10000)`, evaluated in BigInt so the
 * intermediate product is exact for every safe-integer base.
 */
export function calcTaxPaise(basePaise: number, bps: number): number {
  if (!Number.isSafeInteger(basePaise) || basePaise < 0) {
    throw new TypeError(
      `calcTaxPaise expects non-negative integer paise, received ${String(basePaise)}`,
    )
  }
  if (!isBps(bps)) {
    throw new TypeError(
      `calcTaxPaise expects a rate from 0 to ${String(BPS_DENOMINATOR)} bps, received ${String(bps)}`,
    )
  }
  if (bps === 0 || basePaise === 0) return 0

  const numerator = BigInt(basePaise) * BigInt(bps) + 5_000n
  return Number(numerator / BigInt(BPS_DENOMINATOR))
}

/**
 * Parses a percentage typed by the organiser into basis points.
 *
 * 1% is 100 bps and 1 rupee is 100 paise, so the decimal handling is exactly
 * the same operation as `parsePaise` — but the two are kept separate in the
 * public API so a rupee amount can never be passed where a percentage belongs.
 *
 * Returns `null` for anything that is not an exact 0–100% value with at most
 * two decimal places. Negative percentages and values above 100% are rejected
 * rather than clamped.
 */
export function parsePercentToBps(input: string): number | null {
  const bps = parsePaise(input)
  if (bps === null || bps < 0 || bps > BPS_DENOMINATOR) return null
  return bps
}
