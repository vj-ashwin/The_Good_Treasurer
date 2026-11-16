/** Formats an ISO `YYYY-MM-DD` date for display, falling back to the raw value. */
export function formatDate(isoDate: string): string {
  if (!isoDate) return 'No date'
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * True when the value is a real calendar day in `YYYY-MM-DD` form.
 *
 * Checked without `Date` so "2026-02-30" is rejected instead of silently
 * rolling over to March, and without a timezone so the answer is the same on
 * every device.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (month < 1 || month > 12 || day < 1) return false

  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

/**
 * Formats epoch milliseconds for display.
 *
 * `0` means the document is a local write whose `serverTimestamp()` has not
 * been acknowledged yet, so the UI says so rather than showing 1 January 1970.
 */
export function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'Not synced yet'
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Today as an `YYYY-MM-DD` string, used as the default value for date inputs. */
export function todayIso(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

/** True when the ISO date falls inside the given month of the given year. */
export function isInMonth(isoDate: string, year: number, month: number): boolean {
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getFullYear() === year && parsed.getMonth() === month
}

/** The calendar month the app is currently in, used for the month-to-date total. */
export interface MonthWindow {
  label: string
  year: number
  month: number
}

export function currentMonthWindow(): MonthWindow {
  const now = new Date()
  return {
    label: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    year: now.getFullYear(),
    month: now.getMonth(),
  }
}
