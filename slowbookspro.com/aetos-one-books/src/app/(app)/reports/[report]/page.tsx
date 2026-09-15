import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { getReport } from '@/server/reports/registry'
import { parseReportQuery } from '@/server/reports/params'
import { ReportShell } from '../report-shell'
import { ReportTable } from '../report-table'
import { loadReportOptions, reportTerms } from '../shared'

/**
 * Every report renders here. The registry says what a report is and how to
 * build it; this page resolves the request, hands the builder the tenant
 * client, and gives the result to the shared shell.
 */

type Props = {
  params: Promise<{ report: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props) {
  const { report } = await params
  const definition = getReport(report)
  return { title: definition?.title ?? 'Report' }
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { report: id } = await params
  const definition = getReport(id)
  if (!definition) notFound()

  const { db, settings, features, org } = await getAppContext()
  const query = parseReportQuery(await searchParams)
  const currency = settings.get('base_currency') || 'USD'
  const terms = reportTerms(features.nonprofit)

  const [result, options] = await Promise.all([
    definition.build({ db, query, currency, terms }),
    loadReportOptions(db, definition.controls),
  ])

  return (
    <ReportShell
      report={result}
      controls={definition.controls}
      options={options}
      labels={{ class: terms.class, customer: terms.customer }}
      companyName={org.name}
    >
      <ReportTable report={result} hidden={query.hidden} />
    </ReportShell>
  )
}
