import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import type { ReportControl } from '@/server/reports/registry'
import type { ReportResult } from '@/server/reports/types'
import { ReportToolbar, type ToolbarOption } from './report-toolbar'

/**
 * The frame every report renders through: title, period, the shared control
 * bar, the figures, and a print layout that drops the chrome and keeps the
 * numbers. Nothing here knows which report it is holding.
 */

const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  .report-print-header { display: block !important; }
  main { overflow: visible !important; }
  a[href] { text-decoration: none; color: inherit; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
}
`

export function ReportShell({
  report,
  controls,
  options,
  labels,
  companyName,
  children,
}: {
  report: ReportResult
  controls: ReportControl[]
  options: {
    classes: ToolbarOption[]
    jobs: ToolbarOption[]
    accounts: (ToolbarOption & { number: string })[]
    customers: ToolbarOption[]
    vendors: ToolbarOption[]
  }
  labels: { class: string; customer: string }
  companyName: string
  children?: React.ReactNode
}) {
  const optionalColumns = report.columns
    .filter((column) => column.optional)
    .map((column) => ({ key: column.key, label: column.label }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/reports">
            <ArrowLeftIcon /> All reports
          </Link>
        </Button>
      </div>

      <PageHeader title={report.title} description={report.subtitle} className="pb-0" />

      <div className="report-print-header hidden">
        <p className="text-sm font-semibold">{companyName}</p>
      </div>

      <ReportToolbar
        reportId={report.id}
        controls={controls}
        optionalColumns={optionalColumns}
        options={options}
        classLabel={labels.class}
        customerLabel={labels.customer}
      />

      {report.highlights && report.highlights.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.highlights.map((highlight) => (
            <div key={highlight.label} className="bg-card rounded-xl border px-4 py-3">
              <dt className="text-muted-foreground text-xs">{highlight.label}</dt>
              <dd
                className={`num text-lg font-semibold ${
                  highlight.tone === 'negative'
                    ? 'text-negative'
                    : highlight.tone === 'muted'
                      ? 'text-muted-foreground'
                      : ''
                }`}
              >
                {/^-?[\d.]+$/.test(highlight.value)
                  ? formatMoney(highlight.value, report.currency)
                  : highlight.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {children}

      {report.notes && report.notes.length > 0 && (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
