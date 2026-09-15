import 'server-only'
import { Decimal } from 'decimal.js'
import { money } from '@/lib/money'

/**
 * One shape for every report in the product.
 *
 * A report builder returns a `ReportResult`: columns, sections of rows, and
 * cells that know what they are (money, count, date, text). The page renders
 * it, the CSV route serialises it and the print stylesheet lays it out — all
 * from the same value, so a report can never look one way on screen and
 * another way in the export.
 */

export type Cell =
  | { kind: 'text'; text: string; href?: string; muted?: boolean }
  | { kind: 'money'; value: Decimal; href?: string }
  | { kind: 'number'; value: Decimal; places?: number }
  | { kind: 'percent'; value: Decimal }
  | { kind: 'date'; value: Date; href?: string }
  | { kind: 'empty' }

export const text = (value: string | null | undefined, opts: { href?: string; muted?: boolean } = {}): Cell =>
  value == null || value === '' ? { kind: 'empty' } : { kind: 'text', text: value, ...opts }

export const amount = (value: Decimal.Value | null | undefined, href?: string): Cell => ({
  kind: 'money',
  value: money(value),
  ...(href ? { href } : {}),
})

export const count = (value: Decimal.Value | null | undefined, places = 0): Cell => ({
  kind: 'number',
  value: money(value),
  places,
})

export const percent = (value: Decimal.Value | null | undefined): Cell => ({
  kind: 'percent',
  value: money(value),
})

export const day = (value: Date | null | undefined, href?: string): Cell =>
  value ? { kind: 'date', value, ...(href ? { href } : {}) } : { kind: 'empty' }

export const blank: Cell = { kind: 'empty' }

/** How a row carries its weight: a section heading, a subtotal, the grand total. */
export type RowEmphasis = 'normal' | 'heading' | 'subtotal' | 'total'

export type ReportRow = {
  key: string
  cells: Record<string, Cell>
  /** Indentation level, 0-3. Rendered as padding, announced as nothing. */
  level?: number
  emphasis?: RowEmphasis
  /** Clicking the row drills through to here. */
  href?: string
}

export type ReportColumn = {
  key: string
  label: string
  numeric?: boolean
  /** Column-chooser default. A column the user has switched off never renders. */
  optional?: boolean
  /** Second header row, for monthly / comparison column groups. */
  group?: string
  width?: string
}

export type ReportSection = {
  key: string
  title?: string
  rows: ReportRow[]
  /** Rendered under the section, in the same columns. */
  footer?: ReportRow
}

export type ReportResult = {
  id: string
  title: string
  /** Period line under the title: "1 January 2026 – 15 September 2026". */
  subtitle: string
  columns: ReportColumn[]
  sections: ReportSection[]
  currency: string
  /** Caveats worth printing: "Bills are not yet posted", "as of today". */
  notes?: string[]
  /** Shown above the table as a small band of headline figures. */
  highlights?: { label: string; value: string; tone?: 'positive' | 'negative' | 'muted' }[]
  /** True when the report has no rows at all, so the page can say so plainly. */
  empty?: boolean
}

export const emptyRow = (key: string, columns: ReportColumn[]): ReportRow => ({
  key,
  cells: Object.fromEntries(columns.map((c) => [c.key, blank])),
})

/** Build a row from a sparse map — every column the caller omits renders blank. */
export function row(
  key: string,
  columns: ReportColumn[],
  cells: Record<string, Cell>,
  opts: { level?: number; emphasis?: RowEmphasis; href?: string } = {},
): ReportRow {
  const full: Record<string, Cell> = {}
  for (const column of columns) full[column.key] = cells[column.key] ?? blank
  return { key, cells: full, ...opts }
}
