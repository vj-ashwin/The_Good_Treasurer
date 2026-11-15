/**
 * Integer-paise money primitives.
 *
 * Every function here is pure: no Firebase, no React, no clock, no randomness, no I/O.
 * Money is always an integer number of paise (1 rupee = 100 paise). Floating point is
 * never used to represent an amount.
 */

/** Number of paise in one rupee. */
export const PAISE_PER_RUPEE = 100

/** The Indian rupee sign, used when formatting for display. */
export const RUPEE_SIGN = '₹'

/** True when `value` is an integer paise amount that can be represented exactly. */
export function isPaise(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

const AMOUNT_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/
const STRIPPED_CHARS = /[₹,\s]/g

/**
 * Parses a user-entered amount into integer paise.
 *
 * Accepts an optional sign, an optional rupee sign, digit-grouping commas, whitespace,
 * and up to two decimal places. Returns `null` for anything it cannot represent exactly —
 * including more than two decimal places, which are rejected rather than rounded.
 *
 * The decimal part is read digit by digit, so no value ever passes through a float.
 */
export function parsePaise(input: string): number | null {
  if (typeof input !== 'string') return null

  const cleaned = input.replace(STRIPPED_CHARS, '')
  const match = AMOUNT_PATTERN.exec(cleaned)
  if (!match) return null

  const [, sign = '', whole = '', fraction = ''] = match
  if (whole === '' && fraction === '') return null
  if (fraction.length > 2) return null

  const wholeRupees = whole === '' ? 0 : Number.parseInt(whole, 10)
  const fractionPaise = Number.parseInt(`${fraction}00`.slice(0, 2), 10)
  const magnitude = wholeRupees * PAISE_PER_RUPEE + fractionPaise

  if (!Number.isSafeInteger(magnitude)) return null
  return sign === '-' ? -magnitude : magnitude
}

/** Groups plain digits using the Indian lakh/crore convention: 1,23,456. */
function groupIndianDigits(digits: string): string {
  if (digits.length <= 3) return digits

  const lastThree = digits.slice(-3)
  let rest = digits.slice(0, -3)
  const groups: string[] = []

  while (rest.length > 2) {
    groups.unshift(rest.slice(-2))
    rest = rest.slice(0, -2)
  }
  if (rest.length > 0) groups.unshift(rest)

  return `${groups.join(',')},${lastThree}`
}

/**
 * Formats integer paise as an INR amount, e.g. `123456` becomes `₹1,234.56`.
 *
 * Formatting is for display only — the returned string is never parsed back into storage.
 * The function is total: a non-integer or non-finite input is truncated toward zero
 * rather than throwing, so display code never has to branch.
 */
export function formatPaise(paise: number): string {
  let value = paise
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    value = 0
  } else if (!Number.isSafeInteger(value)) {
    value = Math.trunc(value)
  }
  if (!Number.isSafeInteger(value)) value = 0

  const negative = value < 0
  const digits = String(Math.abs(value)).padStart(3, '0')
  const rupees = digits.slice(0, -2)
  const paisePart = digits.slice(-2)

  return `${negative ? '-' : ''}${RUPEE_SIGN}${groupIndianDigits(rupees)}.${paisePart}`
}

/**
 * Sums paise amounts exactly.
 *
 * Throws on a non-integer input so corrupt data surfaces loudly instead of skewing a
 * total, and throws on overflow rather than silently losing precision.
 */
export function sumPaise(amounts: readonly number[]): number {
  let total = 0n

  for (const amount of amounts) {
    if (!isPaise(amount)) {
      throw new TypeError(`sumPaise expects integer paise, received ${String(amount)}`)
    }
    total += BigInt(amount)
  }

  const result = Number(total)
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('sumPaise overflowed the safe integer range')
  }
  return result
}
