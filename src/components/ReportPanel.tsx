import { useRef, useState } from 'react'
import { useHistory } from '../hooks/useHistory'
import { describeError, type Expense, type Person, type Trip } from '../lib/firestore'
import {
  backupFileBase,
  buildTripBackup,
  serializeTripBackup,
} from '../lib/export/backup'
import {
  downloadBlob,
  reportFileBase,
  type PngScope,
  type ReportMeta,
} from '../lib/export/shared'
import { buildTripReport, formatPaise, type TripReport } from '../lib/money'
import ErrorNotice from './ErrorNotice'
import { ChartIcon, DownloadIcon } from './icons'

function rupee(paise: number): string {
  return formatPaise(paise)
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function nameOf(report: TripReport, personId: string): string {
  return report.people.find((person) => person.personId === personId)?.name ?? 'Removed person'
}

function netLabel(netPaise: number): string {
  if (netPaise === 0) return 'Settled'
  return `${netPaise > 0 ? 'Gets' : 'Owes'} ${rupee(Math.abs(netPaise))}`
}

/**
 * Settlement report for one trip (PRD CUJ 5 / CUJ 7).
 *
 * There is no lock and no stored report: every figure is derived from the live
 * expenses, so reopening the tab or changing an expense recalculates it.
 */
export default function ReportPanel({
  uid,
  tripId,
  trip,
  people,
  peopleLoading,
  expenses,
  loading,
  error,
}: {
  uid: string
  tripId: string
  trip: Trip
  people: Person[]
  /** People arrive separately from expenses; a backup must wait for both. */
  peopleLoading: boolean
  /** The trip page owns the single expense subscription and passes it down. */
  expenses: Expense[]
  loading: boolean
  error: string | null
}) {
  const [busy, setBusy] = useState<'pdf' | 'png' | 'backup' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [pngScope, setPngScope] = useState<PngScope>('full')
  const contentRef = useRef<HTMLDivElement>(null)
  const { entries: history, loading: historyLoading, error: historyError } = useHistory(
    uid,
    tripId,
  )

  const tripName = trip.name
  const liveExpenses = expenses.filter((expense) => expense.deletedAt === null)
  const report = buildTripReport(liveExpenses, people)

  const meta = (): ReportMeta => ({ tripName, generatedAt: Date.now() })

  async function handleBackup() {
    setBusy('backup')
    setExportError(null)
    try {
      const generatedAt = Date.now()
      const backup = buildTripBackup({
        trip,
        people,
        expenses,
        history,
        exportedAt: new Date(generatedAt).toISOString(),
      })
      const blob = new Blob([serializeTripBackup(backup)], { type: 'application/json' })
      downloadBlob(blob, `${backupFileBase(trip.name, generatedAt)}.json`)
    } catch (failure) {
      setExportError(describeError(failure))
    } finally {
      setBusy(null)
    }
  }

  async function handlePdf() {
    setBusy('pdf')
    setExportError(null)
    try {
      const { buildReportPdf } = await import('../lib/export/reportPdf')
      const info = meta()
      const blob = await buildReportPdf(report, info)
      downloadBlob(blob, `${reportFileBase(info)}.pdf`)
    } catch (failure) {
      setExportError(describeError(failure))
    } finally {
      setBusy(null)
    }
  }

  async function handlePng() {
    const node = contentRef.current
    if (!node) return
    setBusy('png')
    setExportError(null)
    try {
      const { buildReportPng } = await import('../lib/export/reportPng')
      const info = meta()
      const blob = await buildReportPng(node, pngScope)
      downloadBlob(blob, `${reportFileBase(info)}.png`)
    } catch (failure) {
      setExportError(describeError(failure))
    } finally {
      setBusy(null)
    }
  }

  const canExport = !loading && liveExpenses.length > 0 && !error
  const canBackup = !loading && !peopleLoading && !historyLoading && !error && !historyError

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Settlement report</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Recalculates from the live expenses. Nothing is locked.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              PNG area
              <select
                value={pngScope}
                onChange={(event) => setPngScope(event.target.value as PngScope)}
                disabled={busy !== null}
                className="min-h-11 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:opacity-60"
              >
                <option value="full">Full report</option>
                <option value="visible">Visible area</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handlePdf()}
              disabled={!canExport || busy !== null}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {busy === 'pdf' ? 'Preparing…' : 'PDF'}
            </button>
            <button
              type="button"
              onClick={() => void handlePng()}
              disabled={!canExport || busy !== null}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-card px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {busy === 'png' ? 'Preparing…' : 'PNG'}
            </button>
            <button
              type="button"
              onClick={() => void handleBackup()}
              disabled={!canBackup || busy !== null}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-card px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {busy === 'backup' ? 'Preparing…' : 'JSON backup'}
            </button>
          </div>
        </div>
      </section>

      {error ? <ErrorNotice message={error} /> : null}
      {historyError ? <ErrorNotice message={historyError} /> : null}
      {exportError ? <ErrorNotice message={exportError} /> : null}

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : null}

      {!loading && liveExpenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-card px-6 py-12 text-center">
          <ChartIcon className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">No report yet</p>
          <p className="mt-1 text-sm text-slate-500">
            The settlement report will appear once this trip has expenses.
          </p>
        </div>
      ) : null}

      {/* Always a light "paper" document: PNG/PDF exports stay consistent even
          in dark mode. .light-scope restores the light palette inside it. */}
      {!loading && liveExpenses.length > 0 ? (
        <div ref={contentRef} className="light-scope space-y-5 bg-white">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">
              The Good Treasurer
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{tripName}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Settlement report · INR · {report.liveExpenseCount} live expense
              {report.liveExpenseCount === 1 ? '' : 's'}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                  Trip total
                </dt>
                <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                  {rupee(report.tripTotalPaise)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                  Average per head
                </dt>
                <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                  {rupee(report.averagePerHeadPaise)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                  People
                </dt>
                <dd className="mt-0.5 text-lg font-semibold text-slate-900">{report.headCount}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                  Expenses
                </dt>
                <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                  {report.liveExpenseCount}
                </dd>
              </div>
            </dl>

            {report.differencePaise !== 0 ? (
              <p
                role="status"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                Data warning: the shares do not balance ({rupee(report.differencePaise)} off).
                Transfers are omitted rather than inventing money.
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3 className="px-5 pt-4 text-sm font-semibold text-slate-900">Balances</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 text-left text-[11px] tracking-wide text-slate-500 uppercase">
                    <th scope="col" className="px-5 py-2 font-medium">
                      Person
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Paid
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Share
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.people.map((person) => (
                    <tr key={person.personId}>
                      <th scope="row" className="px-5 py-2.5 text-left font-medium text-slate-800">
                        {person.name ?? 'Removed person'}
                        <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">
                          {shortId(person.personId)}
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {rupee(person.paidPaise)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {rupee(person.sharePaise)}
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right font-medium ${
                          person.netPaise > 0
                            ? 'text-emerald-700'
                            : person.netPaise < 0
                              ? 'text-rose-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {netLabel(person.netPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Who pays whom</h3>
            {report.transfers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {report.differencePaise === 0
                  ? 'No transfers needed.'
                  : 'Transfers are unavailable until the balances add up.'}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {report.transfers.map((transfer, index) => (
                  <li
                    key={`${transfer.from}-${transfer.to}-${String(index)}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <span className="text-slate-700">
                      <span className="font-medium text-slate-900">
                        {nameOf(report, transfer.from)}
                      </span>
                      <span className="ml-1 font-mono text-[10px] text-slate-400">
                        {shortId(transfer.from)}
                      </span>
                      <span className="mx-1.5 text-slate-400">pays</span>
                      <span className="font-medium text-slate-900">
                        {nameOf(report, transfer.to)}
                      </span>
                      <span className="ml-1 font-mono text-[10px] text-slate-400">
                        {shortId(transfer.to)}
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900">
                      {rupee(transfer.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3 className="px-5 pt-4 text-sm font-semibold text-slate-900">Category totals</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {report.categories.map((category) => (
                    <tr key={category.category}>
                      <th
                        scope="row"
                        className="px-5 py-2.5 text-left font-medium text-slate-700"
                      >
                        {category.category}
                      </th>
                      <td className="px-5 py-2.5 text-right font-medium text-slate-900">
                        {rupee(category.totalPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Expense breakdown</h3>
            <div className="mt-3 space-y-4">
              {report.people
                .filter((person) => person.lines.length > 0)
                .map((person) => (
                  <div key={person.personId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        {person.name ?? 'Removed person'}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {rupee(person.sharePaise)}
                      </p>
                    </div>
                    <ul className="mt-1 divide-y divide-slate-100 border-t border-slate-100">
                      {person.lines.map((line) => (
                        <li
                          key={line.expenseId}
                          className="flex items-baseline justify-between gap-3 py-1.5 text-xs"
                        >
                          <span className="text-slate-600">
                            <span className="text-slate-400">{line.date}</span> · {line.title}
                          </span>
                          <span className="shrink-0 text-slate-700">
                            {rupee(line.sharePaise)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
