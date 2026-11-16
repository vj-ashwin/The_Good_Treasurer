/**
 * Turning a stored expense back into the form's input.
 *
 * Editing (PRD G4 / CUJ 6) starts from the stored document. The stored document
 * does not record which split mode or which tax-entry mode produced it — only
 * the resulting shares, rates, amounts and line items. This module infers the
 * modes so the edit dialog reopens on the tab the organiser used, and the
 * values round-trip without changing a single paise.
 *
 * Pure: no Firestore, no React, no clock.
 */

import { splitEqual, type GstParts, type LineItemInput } from './money'
import type { Expense, NewExpense } from './firestore'

/** How the organiser entered a tax: nothing, a rate, or a fixed amount. */
export type TaxMode = 'none' | 'percent' | 'fixed'

/** The mode the edit dialog should reopen on. */
export function inferSplitMode(expense: Expense): 'equal' | 'exact' | 'itemized' {
  if (expense.lineItems !== null) return 'itemized'
  const even = splitEqual(expense.totalPaise, expense.participants)
  return sameShares(even, expense.shares) ? 'equal' : 'exact'
}

/**
 * How a tax was entered, from its stored rate and amount.
 *
 * A stored rate means percent entry. No rate but a positive amount means a
 * fixed rupee amount. No rate and no amount means the tax was not entered.
 */
export function inferTaxMode(rate: number | null, amountPaise: number): TaxMode {
  if (rate !== null) return 'percent'
  return amountPaise > 0 ? 'fixed' : 'none'
}

/** The tax inputs the edit form should prefill. */
export interface ExpenseTaxInput {
  gstMode: TaxMode
  gstBps: number | null
  gstAmountPaise: number | null
  gstParts: GstParts | null
  scMode: TaxMode
  scBps: number | null
  scAmountPaise: number | null
}

/** The tax-entry state for an existing expense. */
export function taxInputFromExpense(expense: Expense): ExpenseTaxInput {
  const gstMode = inferTaxMode(expense.gstBps, expense.gstAmountPaise)
  const scMode = inferTaxMode(expense.serviceChargeBps, expense.serviceChargeAmountPaise)
  return {
    gstMode,
    gstBps: gstMode === 'percent' ? expense.gstBps : null,
    gstAmountPaise: gstMode === 'fixed' ? expense.gstAmountPaise : null,
    gstParts: gstMode === 'fixed' ? expense.gstParts : null,
    scMode,
    scBps: scMode === 'percent' ? expense.serviceChargeBps : null,
    scAmountPaise: scMode === 'fixed' ? expense.serviceChargeAmountPaise : null,
  }
}

/**
 * A `NewExpense` that reproduces the stored document exactly.
 *
 * Re-saving it through `prepareExpense` produces the same shares, totals and
 * line items, which is what makes an edit safe: the operation cannot drift the
 * arithmetic just because the form reopened it.
 */
export function expenseToInput(expense: Expense): NewExpense {
  const base = {
    title: expense.title,
    date: expense.date,
    category: expense.category,
    payerId: expense.payerId,
    participants: [...expense.participants],
    baseAmountPaise: expense.baseAmountPaise,
  }

  if (expense.lineItems !== null) {
    // An itemized bill taxes each line at a rate; a fixed bill-level amount is
    // rejected by the money layer, so none is passed.
    return {
      ...base,
      mode: 'itemized',
      gstBps: expense.gstBps,
      scBps: expense.serviceChargeBps,
      lineItems: expense.lineItems.map(
        (line): LineItemInput => ({
          description: line.description,
          amountPaise: line.amountPaise,
          consumerIds: [...line.consumerIds],
          gstBps: line.gstBps,
          scBps: line.scBps,
        }),
      ),
    }
  }

  const tax = taxInputFromExpense(expense)
  const mode = inferSplitMode(expense)
  return {
    ...base,
    mode,
    gstBps: tax.gstBps,
    scBps: tax.scBps,
    gstAmountPaise: tax.gstAmountPaise,
    scAmountPaise: tax.scAmountPaise,
    gstParts: tax.gstParts,
    ...(mode === 'exact' ? { exactShares: { ...expense.shares } } : {}),
  }
}

/**
 * The expense with an `update` history entry's `before` fields re-applied.
 *
 * An update entry stores only the fields the edit changed, so undoing it means
 * putting exactly those fields back. Used by the "Undo" action on the latest
 * edit in the history panel.
 */
export function applyBeforeSnapshot(
  expense: Expense,
  before: Record<string, unknown> | null,
): Expense {
  if (before === null) return expense
  const merged: Record<string, unknown> = { ...(expense as unknown as Record<string, unknown>) }
  for (const key of Object.keys(before)) {
    if (key in merged) merged[key] = before[key]
  }
  return merged as unknown as Expense
}

function sameShares(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}
