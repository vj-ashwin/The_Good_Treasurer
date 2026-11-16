/**
 * Multi-page PDF export built from the report data (PRD G5/OQ6).
 *
 * `@react-pdf/renderer` produces the document, so the layout is data-driven and
 * print-friendly rather than a screenshot of the screen. This module is loaded
 * on demand by the Report panel; it must not be imported statically there.
 */

import { pdf } from '@react-pdf/renderer'
import type { TripReport } from '../money'
import { ReportDocument } from './reportDocument'
import type { ReportMeta } from './shared'

/** Renders the report to a PDF blob the browser can download. */
export async function buildReportPdf(report: TripReport, meta: ReportMeta): Promise<Blob> {
  return pdf(<ReportDocument report={report} meta={meta} />).toBlob()
}
