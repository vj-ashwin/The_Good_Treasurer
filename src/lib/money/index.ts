/**
 * Public surface of the money module.
 *
 * Everything exported here is a pure function over integer paise. Consumers should not
 * need to reach into the individual files.
 */

export {
  PAISE_PER_RUPEE,
  RUPEE_SIGN,
  formatPaise,
  isPaise,
  parsePaise,
  sumPaise,
} from './paise'
export { splitEqual, splitEvenly, splitExact, itemizedShares } from './split'
export type { ItemizedResult, LineItemInput, Shares, TaxRates } from './split'
export { BPS_DENOMINATOR, BPS_PER_PERCENT, calcTaxPaise, isBps, parsePercentToBps } from './tax'
export { billTotals, finalizeExpense } from './expense'
export type {
  ExpenseTotals,
  FinalizeInput,
  FinalizedExpense,
  GstParts,
  SplitMode,
  StoredLineItem,
} from './expense'
export { balanceDifferencePaise, computeBalances } from './balances'
export type { ExpenseForBalance, PersonBalance, PersonForBalance } from './balances'
export { calculateSettlement } from './settlement'
export type { BalanceForSettlement, Transfer } from './settlement'
export { buildTripReport } from './report'
export type {
  CategoryTotal,
  ExpenseForReport,
  PersonReport,
  ReportLine,
  TripReport,
} from './report'
