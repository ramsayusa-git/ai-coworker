import 'server-only'
import type { Cell, ReportResult } from './types'

/**
 * CSV export of any report.
 *
 * Two rules matter here. Amounts go out unformatted (`1234.56`, no currency
 * symbol, no thousands separator) so a spreadsheet reads them as numbers. And
 * every string cell is checked for a leading `= + - @` or control character —
 * a customer called "=cmd|' /c calc'!A0" must not execute when the file is
 * opened in Excel.
 */

const RISKY = /^[=+\-@\t\r]/

function guard(value: string) {
  return RISKY.test(value) ? `'${value}` : value
}

function escape(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function cellToCsv(cell: Cell): string {
  switch (cell.kind) {
    case 'money':
      return cell.value.toFixed(2)
    case 'number':
      return cell.value.toFixed(cell.places ?? 0)
    case 'percent':
      return cell.value.toFixed(2)
    case 'date':
      return cell.value.toISOString().slice(0, 10)
    case 'text':
      return guard(cell.text)
    case 'empty':
    default:
      return ''
  }
}

export function reportToCsv(report: ReportResult, meta: { company: string; generated: Date }) {
  const lines: string[] = []
  const write = (cells: string[]) => lines.push(cells.map(escape).join(','))

  write([guard(meta.company)])
  write([guard(report.title)])
  write([guard(report.subtitle)])
  write([`Generated ${meta.generated.toISOString()}`])
  write([`Currency ${report.currency}`])
  write([])

  write(['Section', ...report.columns.map((column) => column.label)])

  for (const section of report.sections) {
    if (section.title) write([guard(section.title)])
    for (const row of section.rows) {
      write([
        section.title ? guard(section.title) : '',
        ...report.columns.map((column) => cellToCsv(row.cells[column.key] ?? { kind: 'empty' })),
      ])
    }
    if (section.footer) {
      write([
        section.title ? guard(section.title) : '',
        ...report.columns.map((column) =>
          cellToCsv(section.footer!.cells[column.key] ?? { kind: 'empty' }),
        ),
      ])
    }
  }

  if (report.notes?.length) {
    write([])
    for (const note of report.notes) write([guard(note)])
  }

  return `${lines.join('\r\n')}\r\n`
}

/** `profit-and-loss-2026-09-15.csv` — sortable, and obvious a year later. */
export function csvFilename(reportId: string, generated: Date) {
  return `${reportId}-${generated.toISOString().slice(0, 10)}.csv`
}
