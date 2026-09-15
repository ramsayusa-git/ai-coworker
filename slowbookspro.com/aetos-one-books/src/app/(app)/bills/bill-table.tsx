'use client'
import Link from 'next/link'
import { ReceiptIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'
import { BillStatusBadge } from './bill-status'

export type BillRow = {
  id: number
  billNumber: string
  vendorId: number
  vendorName: string
  date: string
  dueDate: string | null
  status: string
  overdue: boolean
  total: string
  balanceDue: string
}

export function BillTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: BillRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<BillRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortKey: 'billNumber',
      render: (row) => <span className="font-medium">{row.billNumber}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor',
      render: (row) => <span className="truncate">{row.vendorName}</span>,
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
      render: (row) =>
        row.overdue ? (
          <Badge variant="destructive">Overdue</Badge>
        ) : (
          <BillStatusBadge status={row.status} />
        ),
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
      rowHref={(row) => `/bills/${row.id}`}
      searchPlaceholder="Search by number, reference or vendor…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={ReceiptIcon}
          title="No bills yet"
          description="A bill debits the expense — or inventory, for stock — and credits accounts payable the moment it is entered, so what you owe is never a guess."
          action={
            <Button asChild size="sm">
              <Link href="/bills/new">New bill</Link>
            </Button>
          }
        />
      }
    />
  )
}
