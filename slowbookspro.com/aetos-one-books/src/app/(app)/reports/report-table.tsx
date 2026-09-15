import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber } from '@/lib/money'
import type { Cell, ReportColumn, ReportResult, ReportRow } from '@/server/reports/types'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

/**
 * One renderer for every report. It reads a `ReportResult` and nothing else,
 * so a new report is a new builder, never a new table component.
 *
 * Figures are tabular, right-aligned and drill through to the account register
 * for the same period. A negative is a minus sign first and a colour second —
 * the sign is the meaning, the colour only helps.
 */

function renderCell(cell: Cell, currency: string) {
  switch (cell.kind) {
    case 'money': {
      const body = formatMoney(cell.value, currency)
      const negative = cell.value.isNegative()
      const content = <span className={negative ? 'text-negative' : undefined}>{body}</span>
      return cell.href ? (
        <Link href={cell.href} className="hover:text-primary underline-offset-4 hover:underline">
          {content}
        </Link>
      ) : (
        content
      )
    }
    case 'number':
      return <span>{formatNumber(cell.value, cell.places ?? 0)}</span>
    case 'percent':
      return (
        <span className={cell.value.isNegative() ? 'text-negative' : undefined}>
          {formatNumber(cell.value, 1)}%
        </span>
      )
    case 'date':
      return <span className="whitespace-nowrap">{cell.value.toISOString().slice(0, 10)}</span>
    case 'text':
      return cell.href ? (
        <Link href={cell.href} className="hover:text-primary underline-offset-4 hover:underline">
          {cell.text}
        </Link>
      ) : (
        <span className={cell.muted ? 'text-muted-foreground' : undefined}>{cell.text}</span>
      )
    case 'empty':
    default:
      return <span className="text-muted-foreground">—</span>
  }
}

function Row({
  row,
  columns,
  currency,
}: {
  row: ReportRow
  columns: ReportColumn[]
  currency: string
}) {
  const emphasis = row.emphasis ?? 'normal'
  return (
    <TableRow
      className={cn(
        emphasis === 'subtotal' && 'bg-muted/40 font-medium',
        emphasis === 'total' && 'bg-muted/60 border-t-2 font-semibold',
      )}
    >
      {columns.map((column, index) => {
        const cell = row.cells[column.key] ?? { kind: 'empty' as const }
        const body =
          index === 0 && row.href && cell.kind === 'text' && !cell.href ? (
            <Link href={row.href} className="hover:text-primary underline-offset-4 hover:underline">
              {cell.text}
            </Link>
          ) : (
            renderCell(cell, currency)
          )
        return (
          <TableCell
            key={column.key}
            numeric={column.numeric}
            style={{
              ...(column.width ? { width: column.width } : {}),
              ...(index === 0 && row.level ? { paddingLeft: `${0.75 + row.level * 1}rem` } : {}),
            }}
          >
            {body}
          </TableCell>
        )
      })}
    </TableRow>
  )
}

export function ReportTable({
  report,
  hidden = [],
}: {
  report: ReportResult
  hidden?: string[]
}) {
  const columns = report.columns.filter((column) => !(column.optional && hidden.includes(column.key)))

  if (report.sections.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
        Nothing to show for this period.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border print:border-0">
      <Table>
        <caption className="sr-only">
          {report.title}. {report.subtitle}.
        </caption>
        <TableHeader className="bg-muted/40">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} numeric={column.numeric} scope="col">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.sections.map((section) => (
            <React.Fragment key={section.key}>
              {section.title && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="text-foreground bg-muted/20 pt-4 text-xs font-semibold tracking-wide uppercase"
                  >
                    {section.title}
                  </TableCell>
                </TableRow>
              )}
              {section.rows.map((row) => (
                <Row key={row.key} row={row} columns={columns} currency={report.currency} />
              ))}
              {section.footer && (
                <Row
                  key={section.footer.key}
                  row={section.footer}
                  columns={columns}
                  currency={report.currency}
                />
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
