/**
 * Turns one expense form into the stored money fields.
 *
 * This is the single place where a mode (`equal`, `exact`, `itemized`) becomes
 * the `shares` map Firestore stores. Keeping it here — pure, integer-only,
 * property-tested — is what makes the arithmetic in the UI, the Firestore
 * writer and the report all agree on the paise.
 *
 * Tax can arrive two ways (PRD G3/OQ2):
 * - as a rate in basis points, calculated per bill or per line item;
 * - as a fixed rupee amount, which the organiser may split into
 *   CGST/SGST/IGST. A fixed amount only makes sense for a single bill, so it is
 *   rejected for itemized bills, where tax is per line.
 *
 * Invariants, asserted by the tests:
 * - `sum(shares) === totalPaise`, with no paise created or lost.
 * - `totalPaise === base + gst + serviceCharge`.
 * - Every share is a non-negative safe integer.
 */

import { calcTaxPaise, isBps } from './tax'
import {
  itemizedShares,
  splitEqual,
  splitExact,
  type LineItemInput,
  type Shares,
} from './split'

/** The three split modes from PRD G2. */
export type SplitMode = 'equal' | 'exact' | 'itemized'

/** A fixed GST amount broken down the way a tax invoice shows it. */
export interface GstParts {
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
}

/** One line item exactly as it is stored on the expense document. */
export interface StoredLineItem {
  description: string
  amountPaise: number
  consumerIds: string[]
  /** Effective rate for this line, resolved against the bill rate at entry time. */
  gstBps: number
  scBps: number
  gstAmountPaise: number
  serviceChargeAmountPaise: number
}

/** The four money fields every expense stores. */
export interface ExpenseTotals {
  basePaise: number
  gstPaise: number
  serviceChargePaise: number
  totalPaise: number
}

/** Everything `createExpense` needs to write the money side of an expense. */
export interface FinalizedExpense extends ExpenseTotals {
  shares: Shares
  /** `null` for equal and exact, where there are no line items. */
  lineItems: StoredLineItem[] | null
  /** `null` unless GST was entered as a fixed amount split into parts. */
  gstParts: GstParts | null
}

export interface FinalizeInput {
  mode: SplitMode
  /** Base amount before tax. For itemized mode it must equal the line-item sum. */
  baseAmountPaise: number
  /** Bill-level rates. `null` and `undefined` both mean "no tax". */
  gstBps?: number | null
  scBps?: number | null
  /** Fixed GST in paise. Overrides `gstBps`. Equal/exact mode only. */
  gstAmountPaise?: number | null
  /** Fixed service charge in paise. Overrides `scBps`. Equal/exact mode only. */
  scAmountPaise?: number | null
  /** Optional CGST/SGST/IGST split. Must add up to `gstAmountPaise`. */
  gstParts?: GstParts | null
  participantIds: readonly string[]
  /** Required for `exact`: every participant's share, summing to the bill total. */
  exactShares?: Readonly<Record<string, number>>
  /** Required for `itemized`. */
  lineItems?: readonly LineItemInput[]
}

function requireRate(value: number | null | undefined, label: string): number {
  const rate = value ?? 0
  if (!isBps(rate)) {
    throw new TypeError(`${label} must be a rate from 0 to 10000 basis points`)
  }
  return rate
}

function requireBase(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('An expense needs a positive integer paise base amount')
  }
  return value
}

function requireFixed(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be non-negative integer paise`)
  }
  return value
}

function requireGstParts(value: GstParts | null | undefined): GstParts | null {
  if (value === null || value === undefined) return null
  const parts = [value.cgstPaise, value.sgstPaise, value.igstPaise]
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    throw new TypeError('CGST, SGST and IGST must be non-negative integer paise')
  }
  return {
    cgstPaise: value.cgstPaise,
    sgstPaise: value.sgstPaise,
    igstPaise: value.igstPaise,
  }
}

/**
 * Base, tax and total for a bill taxed at the bill level.
 *
 * Equal and exact splits are a single implicit line item, so the stored tax is
 * calculated once, on the base, and the total is the plain sum of the parts.
 * A fixed amount, when supplied, replaces the calculated tax for that side.
 */
export function billTotals(
  baseAmountPaise: number,
  gstBps?: number | null,
  scBps?: number | null,
  gstAmountPaise?: number | null,
  scAmountPaise?: number | null,
): ExpenseTotals {
  const base = requireBase(baseAmountPaise)
  const fixedGst = requireFixed(gstAmountPaise, 'GST amount')
  const fixedSc = requireFixed(scAmountPaise, 'Service charge amount')
  const gst = fixedGst ?? calcTaxPaise(base, requireRate(gstBps, 'GST'))
  const sc = fixedSc ?? calcTaxPaise(base, requireRate(scBps, 'Service charge'))
  return {
    basePaise: base,
    gstPaise: gst,
    serviceChargePaise: sc,
    totalPaise: base + gst + sc,
  }
}

/**
 * Resolves a mode into shares, stored line items and totals.
 *
 * Throws a `TypeError` for bad arithmetic inputs and an `Error` for a split
 * that does not add up; the caller turns both into a form message.
 */
export function finalizeExpense(input: FinalizeInput): FinalizedExpense {
  const gstBps = requireRate(input.gstBps, 'GST')
  const scBps = requireRate(input.scBps, 'Service charge')
  const fixedGst = requireFixed(input.gstAmountPaise, 'GST amount')
  const fixedSc = requireFixed(input.scAmountPaise, 'Service charge amount')
  const gstParts = requireGstParts(input.gstParts)

  if (gstParts !== null) {
    if (fixedGst === null) {
      throw new Error('Enter a total GST amount before splitting it into CGST, SGST and IGST')
    }
    const partsTotal = gstParts.cgstPaise + gstParts.sgstPaise + gstParts.igstPaise
    if (partsTotal !== fixedGst) {
      throw new Error('CGST, SGST and IGST must add up to the GST amount')
    }
  }

  if (input.mode === 'equal') {
    const totals = billTotals(input.baseAmountPaise, gstBps, scBps, fixedGst, fixedSc)
    return {
      ...totals,
      shares: splitEqual(totals.totalPaise, input.participantIds),
      lineItems: null,
      gstParts,
    }
  }

  if (input.mode === 'exact') {
    const totals = billTotals(input.baseAmountPaise, gstBps, scBps, fixedGst, fixedSc)
    if (!input.exactShares) {
      throw new Error('An exact split needs an amount for every participant')
    }
    return {
      ...totals,
      shares: splitExact(input.exactShares, totals.totalPaise, input.participantIds),
      lineItems: null,
      gstParts,
    }
  }

  if (fixedGst !== null || fixedSc !== null || gstParts !== null) {
    throw new Error('An itemized bill taxes each line at a rate, not as a fixed amount')
  }

  const lines = input.lineItems ?? []
  const result = itemizedShares(lines, input.participantIds, { gstBps, scBps })

  // The form shows a base amount and the line items separately; if they drift
  // apart the stored document would disagree with what the organiser saw.
  if (result.basePaise !== input.baseAmountPaise) {
    throw new Error('Line items must sum to the base amount')
  }

  const storedLines: StoredLineItem[] = lines.map((line) => {
    const effectiveGst = line.gstBps ?? gstBps
    const effectiveSc = line.scBps ?? scBps
    return {
      description: line.description,
      amountPaise: line.amountPaise,
      consumerIds: [...line.consumerIds],
      gstBps: effectiveGst,
      scBps: effectiveSc,
      gstAmountPaise: calcTaxPaise(line.amountPaise, effectiveGst),
      serviceChargeAmountPaise: calcTaxPaise(line.amountPaise, effectiveSc),
    }
  })

  return {
    basePaise: result.basePaise,
    gstPaise: result.gstPaise,
    serviceChargePaise: result.serviceChargePaise,
    totalPaise: result.totalPaise,
    shares: result.shares,
    lineItems: storedLines,
    gstParts: null,
  }
}
