'use client'
import Link from 'next/link'
import { ClipboardListIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { DocumentStatus } from '@/components/app/document-status'
import { EmptyState } from '@/components/app/page-header'

export type EstimateRow = {
  id: number
  estimateNumber: string
  customerName: string
  date: string
  expirationDate: string | null
  expired: boolean
  status: string
  total: string
  convertedInvoiceId: number | null
}

export function EstimateTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: EstimateRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<EstimateRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortKey: 'estimateNumber',
      render: (row) => <span className="font-medium">{row.estimateNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => <span className="truncate">{row.customerName}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      hideBelow: 'sm',
      render: (row) => <span className="whitespace-nowrap">{row.date}</span>,
    },
    {
      key: 'expires',
      header: 'Expires',
      sortKey: 'expirationDate',
      hideBelow: 'md',
      render: (row) =>
        row.expirationDate ? (
          <span className={`whitespace-nowrap ${row.expired ? 'text-destructive font-medium' : ''}`}>
            {row.expirationDate}
            {row.expired && <span className="sr-only"> (expired)</span>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <DocumentStatus kind="estimate" status={row.status} />,
    },
    {
      key: 'invoice',
      header: 'Invoice',
      hideBelow: 'lg',
      render: (row) =>
        row.convertedInvoiceId ? (
          <Link
            href={`/invoices/${row.convertedInvoiceId}`}
            className="text-primary underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            View
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'total', header: 'Total', sortKey: 'total', numeric: true, render: (row) => row.total },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      total={total}
      page={page}
      pageSize={pageSize}
      rowKey={(row) => row.id}
      rowHref={(row) => `/estimates/${row.id}`}
      searchPlaceholder="Search by number or customer…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={ClipboardListIcon}
          title="No estimates yet"
          description="An estimate posts nothing to the ledger. It becomes a financial event only when you convert it to an invoice."
          action={
            <Button asChild size="sm">
              <Link href="/estimates/new">New estimate</Link>
            </Button>
          }
        />
      }
    />
  )
}
