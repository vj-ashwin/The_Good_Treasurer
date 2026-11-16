/**
 * The PDF document layout for the settlement report (PRD G5/OQ6).
 *
 * Kept apart from `reportPdf.tsx` so that file only exports a function; mixing a
 * component with a non-component export breaks React Fast Refresh.
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatTimestamp } from '../format'
import type { TripReport } from '../money'
import { pdfMoney, type ReportMeta } from './shared'

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1e293b',
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 12,
    marginBottom: 16,
  },
  kicker: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: '#0f766e',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 9,
    color: '#64748b',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  summaryBox: {
    width: '25%',
    paddingRight: 8,
  },
  summaryLabel: {
    fontSize: 7,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  warning: {
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    padding: 8,
    marginBottom: 14,
    fontSize: 8,
    color: '#92400e',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  table: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 5,
  },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#94a3b8',
    paddingBottom: 4,
  },
  headCell: {
    fontSize: 7,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nameCell: { width: '40%', paddingRight: 6 },
  amountCell: { width: '20%', textAlign: 'right', paddingLeft: 6 },
  idText: { fontSize: 7, color: '#94a3b8' },
  muted: { color: '#64748b' },
  bold: { fontFamily: 'Helvetica-Bold' },
  empty: { fontSize: 9, color: '#64748b', fontStyle: 'italic' },
  personBlock: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 6,
  },
  personHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 10,
    color: '#475569',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#94a3b8',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})

function nameOf(report: TripReport, personId: string): string {
  return report.people.find((person) => person.personId === personId)?.name ?? 'Removed person'
}

function netLabel(netPaise: number): string {
  if (netPaise === 0) return 'Settled'
  return `${netPaise > 0 ? 'Gets' : 'Owes'} ${pdfMoney(Math.abs(netPaise))}`
}

export function ReportDocument({ report, meta }: { report: TripReport; meta: ReportMeta }) {
  return (
    <Document
      title={`${meta.tripName} — Settlement report`}
      author="The Good Treasurer"
      subject="Trip settlement report"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.kicker}>THE GOOD TREASURER</Text>
          <Text style={styles.title}>{meta.tripName}</Text>
          <Text style={styles.subtitle}>
            Settlement report · Generated {formatTimestamp(meta.generatedAt)} · INR
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Trip total</Text>
            <Text style={styles.summaryValue}>{pdfMoney(report.tripTotalPaise)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Average per head</Text>
            <Text style={styles.summaryValue}>{pdfMoney(report.averagePerHeadPaise)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>People</Text>
            <Text style={styles.summaryValue}>{String(report.headCount)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={styles.summaryValue}>{String(report.liveExpenseCount)}</Text>
          </View>
        </View>

        {report.differencePaise !== 0 ? (
          <Text style={styles.warning}>
            Data warning: the shares do not balance ({pdfMoney(report.differencePaise)} off).
            Transfers are omitted rather than inventing money. Recheck the recorded expenses.
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Balances</Text>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.nameCell]}>Person</Text>
            <Text style={[styles.headCell, styles.amountCell]}>Paid</Text>
            <Text style={[styles.headCell, styles.amountCell]}>Share</Text>
            <Text style={[styles.headCell, styles.amountCell]}>Net</Text>
          </View>
          {report.people.map((person) => (
            <View key={person.personId} style={styles.row} wrap={false}>
              <View style={styles.nameCell}>
                <Text style={styles.bold}>{person.name ?? 'Removed person'}</Text>
                <Text style={styles.idText}>{person.personId}</Text>
              </View>
              <Text style={styles.amountCell}>{pdfMoney(person.paidPaise)}</Text>
              <Text style={styles.amountCell}>{pdfMoney(person.sharePaise)}</Text>
              <Text style={styles.amountCell}>{netLabel(person.netPaise)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Who pays whom</Text>
          {report.transfers.length === 0 ? (
            <Text style={styles.empty}>No transfers needed.</Text>
          ) : (
            report.transfers.map((transfer, index) => (
              <View
                key={`${transfer.from}-${transfer.to}-${String(index)}`}
                style={styles.row}
                wrap={false}
              >
                <Text style={styles.nameCell}>
                  <Text style={styles.bold}>{nameOf(report, transfer.from)}</Text>
                  <Text style={styles.idText}> ({transfer.from})</Text>
                  <Text>{' pays '}</Text>
                  <Text style={styles.bold}>{nameOf(report, transfer.to)}</Text>
                  <Text style={styles.idText}> ({transfer.to})</Text>
                </Text>
                <Text style={[styles.amountCell, styles.bold]}>
                  {pdfMoney(transfer.amountPaise)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category totals</Text>
          {report.categories.length === 0 ? (
            <Text style={styles.empty}>No categories yet.</Text>
          ) : (
            report.categories.map((category) => (
              <View key={category.category} style={styles.row} wrap={false}>
                <Text style={styles.nameCell}>{category.category}</Text>
                <Text style={[styles.amountCell, styles.bold]}>
                  {pdfMoney(category.totalPaise)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expense breakdown</Text>
          {report.people
            .filter((person) => person.lines.length > 0)
            .map((person) => (
              <View key={person.personId} style={styles.personBlock}>
                <View style={styles.personHeading}>
                  <Text style={styles.bold}>{person.name ?? 'Removed person'}</Text>
                  <Text style={styles.muted}>{pdfMoney(person.sharePaise)}</Text>
                </View>
                {person.lines.map((line) => (
                  <View key={line.expenseId} style={styles.lineRow} wrap={false}>
                    <Text>
                      {line.date} · {line.title}
                    </Text>
                    <Text>{pdfMoney(line.sharePaise)}</Text>
                  </View>
                ))}
              </View>
            ))}
          {report.people.every((person) => person.lines.length === 0) ? (
            <Text style={styles.empty}>No expenses recorded.</Text>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <Text>{meta.tripName} · The Good Treasurer</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${String(pageNumber)} of ${String(totalPages)}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
