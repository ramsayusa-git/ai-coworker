import 'server-only'
import type { Prisma } from '@/generated/tenant/client'

/**
 * The query contract every report shares:
 *
 *   ?from=&to=&preset=&columns=&compare=&class=&job=&cols=
 *
 * Parsed here so the page, the CSV route and the report builders all read the
 * same request the same way. A report is a link you can send to your
 * accountant, so nothing lives in component state that belongs in the URL.
 */

export type ColumnMode = 'total' | 'month' | 'quarter'
export type CompareMode = 'none' | 'prior_period' | 'prior_year'

export type ReportQuery = {
  from: Date
  to: Date
  asOf: Date
  preset: string
  columns: ColumnMode
  compare: CompareMode
  classId: number | null
  jobId: number | null
  accountId: number | null
  customerId: number | null
  vendorId: number | null
  itemId: number | null
  year: number
  /** Columns the user switched off in the column chooser. */
  hidden: string[]
  /** Raw params, so a report can read one of its own. */
  raw: Record<string, string>
}

export type RawParams = Record<string, string | string[] | undefined>

const utc = (year: number, month: number, dayOfMonth: number) =>
  new Date(Date.UTC(year, month, dayOfMonth))

export const today = () => {
  const now = new Date()
  return utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10)

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const PRESETS = [
  'this-month',
  'last-month',
  'this-quarter',
  'last-quarter',
  'this-year',
  'last-year',
  'year-to-date',
  'custom',
] as const
export type Preset = (typeof PRESETS)[number]

export const PRESET_LABELS: Record<Preset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-quarter': 'This quarter',
  'last-quarter': 'Last quarter',
  'this-year': 'This year',
  'last-year': 'Last year',
  'year-to-date': 'Year to date',
  custom: 'Custom',
}

/** Resolve a named period against a reference day (defaults to today, UTC). */
export function presetRange(preset: Preset, ref = today()): { from: Date; to: Date } {
  const y = ref.getUTCFullYear()
  const m = ref.getUTCMonth()
  const quarter = Math.floor(m / 3)
  switch (preset) {
    case 'this-month':
      return { from: utc(y, m, 1), to: ref }
    case 'last-month':
      return { from: utc(y, m - 1, 1), to: utc(y, m, 0) }
    case 'this-quarter':
      return { from: utc(y, quarter * 3, 1), to: ref }
    case 'last-quarter':
      return { from: utc(y, quarter * 3 - 3, 1), to: utc(y, quarter * 3, 0) }
    case 'last-year':
      return { from: utc(y - 1, 0, 1), to: utc(y - 1, 11, 31) }
    case 'this-year':
    case 'year-to-date':
    default:
      return { from: utc(y, 0, 1), to: ref }
  }
}

/** The period immediately before this one, for the comparison column. */
export function comparisonRange(
  from: Date,
  to: Date,
  mode: CompareMode,
): { from: Date; to: Date } | null {
  if (mode === 'none') return null
  if (mode === 'prior_year') {
    return {
      from: utc(from.getUTCFullYear() - 1, from.getUTCMonth(), from.getUTCDate()),
      to: utc(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()),
    }
  }
  const dayMs = 86_400_000
  const span = Math.round((to.getTime() - from.getTime()) / dayMs) + 1
  return {
    from: new Date(from.getTime() - span * dayMs),
    to: new Date(from.getTime() - dayMs),
  }
}

export const COMPARE_LABELS: Record<CompareMode, string> = {
  none: 'No comparison',
  prior_period: 'Prior period',
  prior_year: 'Prior year',
}

export function parseReportQuery(params: RawParams): ReportQuery {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value
    if (typeof single === 'string') raw[key] = single
  }

  const preset = (PRESETS as readonly string[]).includes(raw.preset ?? '')
    ? (raw.preset as Preset)
    : 'custom'

  const explicitFrom = parseDate(raw.from)
  const explicitTo = parseDate(raw.to)
  const fallback =
    preset === 'custom' && !explicitFrom && !explicitTo
      ? presetRange('year-to-date')
      : presetRange(preset === 'custom' ? 'year-to-date' : preset)

  const from = explicitFrom ?? fallback.from
  const to = explicitTo ?? fallback.to
  const asOf = parseDate(raw.asOf) ?? to

  const int = (key: string): number | null => {
    const value = Number.parseInt(raw[key] ?? '', 10)
    return Number.isFinite(value) ? value : null
  }

  const columns: ColumnMode =
    raw.columns === 'month' ? 'month' : raw.columns === 'quarter' ? 'quarter' : 'total'
  const compare: CompareMode =
    raw.compare === 'prior_period'
      ? 'prior_period'
      : raw.compare === 'prior_year'
        ? 'prior_year'
        : 'none'

  return {
    from,
    to,
    asOf,
    preset: raw.preset ?? (explicitFrom || explicitTo ? 'custom' : 'year-to-date'),
    columns,
    compare,
    classId: int('class'),
    jobId: int('job'),
    accountId: int('account'),
    customerId: int('customer'),
    vendorId: int('vendor'),
    itemId: int('item'),
    year: int('year') ?? today().getUTCFullYear(),
    hidden: (raw.hide ?? '').split(',').filter(Boolean),
    raw,
  }
}

/**
 * Class and job are attributed the way the ledger reads them: the split wins,
 * the header is the fallback. In SQL that is a COALESCE; in Prisma it is this
 * pair of OR branches, which compiles to the same index use.
 */
export function dimensionFilter(query: {
  classId: number | null
  jobId: number | null
}): Prisma.TransactionLineWhereInput {
  const clauses: Prisma.TransactionLineWhereInput[] = []
  if (query.classId != null) {
    clauses.push({
      OR: [{ classId: query.classId }, { classId: null, transaction: { classId: query.classId } }],
    })
  }
  if (query.jobId != null) {
    clauses.push({
      OR: [{ jobId: query.jobId }, { jobId: null, transaction: { jobId: query.jobId } }],
    })
  }
  return clauses.length === 0 ? {} : { AND: clauses }
}

/** Human period line: "1 Jan 2026 – 15 Sep 2026". */
export function periodLabel(from: Date, to: Date) {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${fmt(from)} – ${fmt(to)}`
}

export function asOfLabel(asOf: Date) {
  return `As of ${asOf.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
}

/** Calendar month starts covering a period, inclusive. */
export function monthStarts(from: Date, to: Date): Date[] {
  const out: Date[] = []
  let cursor = utc(from.getUTCFullYear(), from.getUTCMonth(), 1)
  while (cursor <= to && out.length < 120) {
    out.push(cursor)
    cursor = utc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
  }
  return out
}

export function quarterStarts(from: Date, to: Date): Date[] {
  const out: Date[] = []
  let cursor = utc(from.getUTCFullYear(), Math.floor(from.getUTCMonth() / 3) * 3, 1)
  while (cursor <= to && out.length < 60) {
    out.push(cursor)
    cursor = utc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1)
  }
  return out
}

export const monthEnd = (start: Date) =>
  utc(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)

export const quarterEnd = (start: Date) =>
  utc(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)

export const monthKey = (date: Date) => date.toISOString().slice(0, 7)

export const monthLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

export const quarterLabel = (date: Date) =>
  `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`

/** Keep the current period on a drill-down link so the register matches the row. */
export function registerHref(accountId: number, from: Date, to: Date, query?: ReportQuery) {
  const search = new URLSearchParams({
    account: String(accountId),
    from: isoDate(from),
    to: isoDate(to),
  })
  if (query?.classId != null) search.set('class', String(query.classId))
  if (query?.jobId != null) search.set('job', String(query.jobId))
  return `/reports/account-register?${search.toString()}`
}
