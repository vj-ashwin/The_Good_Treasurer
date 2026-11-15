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
