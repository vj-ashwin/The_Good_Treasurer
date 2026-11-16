/**
 * Shared metadata and download helpers for the report exports.
 *
 * Kept separate from the renderers so the screen can build a filename without
 * pulling the PDF or PNG code into the initial bundle.
 */

import { formatPaise } from '../money'

export interface ReportMeta {
  tripName: string
  /** Epoch milliseconds, captured when the organiser clicks Export. */
  generatedAt: number
}

/** How much of the report a PNG capture includes. */
export type PngScope = 'full' | 'visible'

/**
 * A filesystem-safe base name, e.g. `goa-2026-settlement-2026-11-16`.
 *
 * Only ASCII letters, digits and single dashes survive, so the name is valid on
 * every platform and never depends on the device locale.
 */
export function reportFileBase(meta: ReportMeta): string {
  const slug = meta.tripName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const date = new Date(meta.generatedAt).toISOString().slice(0, 10)
  return `${slug || 'trip'}-settlement-${date}`
}

/**
 * Formats paise for the PDF.
 *
 * The built-in Helvetica font has no rupee glyph, so the PDF says `Rs` instead
 * of `₹`. PNG captures the DOM and keeps the rupee sign. Both remain INR.
 */
export function pdfMoney(paise: number): string {
  return formatPaise(paise).replace('\u20b9', 'Rs ')
}

/** Starts a browser download for a blob, then releases the object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // The click has been handled by the next task; the URL can be released then.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
