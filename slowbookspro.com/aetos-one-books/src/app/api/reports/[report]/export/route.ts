import { NextResponse } from 'next/server'
import { getAppContext } from '@/server/context'
import { AuthError } from '@/server/auth'
import { getReport } from '@/server/reports/registry'
import { parseReportQuery } from '@/server/reports/params'
import { csvFilename, reportToCsv } from '@/server/reports/csv'
import { reportTerms } from '@/app/(app)/reports/shared'

/**
 * CSV export for any report in the catalogue.
 *
 * The query string is the one the page was showing, parsed by the same code,
 * and the report is built by the same builder — so the file is what was on
 * screen, not a second implementation that drifts from it.
 */

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report: id } = await params
  const definition = getReport(id)
  if (!definition) {
    return NextResponse.json({ error: 'No such report' }, { status: 404 })
  }

  let context
  try {
    context = await getAppContext()
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    throw error
  }

  const { db, settings, features, org } = context
  const url = new URL(request.url)
  const raw = Object.fromEntries(url.searchParams.entries())
  const query = parseReportQuery(raw)
  const currency = settings.get('base_currency') || 'USD'

  const result = await definition.build({
    db,
    query,
    currency,
    terms: reportTerms(features.nonprofit),
  })

  const generated = new Date()
  const body = reportToCsv(result, { company: org.name, generated })

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(definition.id, generated)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
