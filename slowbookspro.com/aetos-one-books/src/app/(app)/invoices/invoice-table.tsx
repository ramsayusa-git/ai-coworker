'use client'
import Link from 'next/link'
import { FileTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { DocumentStatus } from '@/components/app/document-status'
import { EmptyState } from '@/components/app/page-header'

export type InvoiceRow = {
  id: number
  invoiceNumber: string
  customerId: number
  customerName: string
  date: string
  dueDate: string | null
  status: string
  overdue: boolean
  total: string
  balanceDue: string
}

export function InvoiceTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
  label,
}: {
  rows: InvoiceRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  label: string
}) {
  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortKey: 'invoiceNumber',
      render: (row) => <span className="font-medium">{row.invoiceNumber}</span>,
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
      key: 'dueDate',
      header: 'Due',
      sortKey: 'dueDate',
      hideBelow: 'md',
      render: (row) => (
        <span className={`whitespace-nowrap ${row.overdue ? 'text-destructive font-medium' : ''}`}>
          {row.dueDate ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <DocumentStatus kind="invoice" status={row.status} overdue={row.overdue} />,
    },
    { key: 'total', header: 'Total', sortKey: 'total', numeric: true, render: (row) => row.total },
    {
      key: 'balance',
      header: 'Balance',
      sortKey: 'balanceDue',
      numeric: true,
      render: (row) => (
        <span className={row.overdue ? 'text-destructive font-medium' : undefined}>
          {row.balanceDue}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      total={total}
      page={page}
      pageSize={pageSize}
      rowKey={(row) => row.id}
      rowHref={(row) => `/invoices/${row.id}`}
      searchPlaceholder="Search by number, customer or purchase order…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={FileTextIcon}
          title={`No ${label.toLowerCase()}s yet`}
          description="An invoice debits accounts receivable and credits income the moment it is created, so the books stay current without a second step."
          action={
            <Button asChild size="sm">
              <Link href="/invoices/new">New {label.toLowerCase()}</Link>
            </Button>
          }
        />
      }
    />
  )
}
