'use client'
import Link from 'next/link'
import { ShoppingCartIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'
import { PoStatusBadge } from '../bills/bill-status'

export type PurchaseOrderRow = {
  id: number
  poNumber: string
  vendorName: string
  date: string
  expectedDate: string | null
  status: string
  total: string
}

export function PurchaseOrderTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: PurchaseOrderRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<PurchaseOrderRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortKey: 'poNumber',
      render: (row) => <span className="font-medium">{row.poNumber}</span>,
    },
    { key: 'vendor', header: 'Vendor', render: (row) => <span className="truncate">{row.vendorName}</span> },
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      hideBelow: 'sm',
      render: (row) => <span className="whitespace-nowrap">{row.date}</span>,
    },
    {
      key: 'expected',
      header: 'Expected',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{row.expectedDate ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <PoStatusBadge status={row.status} />,
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
      rowHref={(row) => `/purchase-orders/${row.id}`}
      searchPlaceholder="Search by number or vendor…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={ShoppingCartIcon}
          title="No purchase orders yet"
          description="A purchase order is a commitment, not a transaction: nothing posts until you turn it into a bill."
          action={
            <Button asChild size="sm">
              <Link href="/purchase-orders/new">New purchase order</Link>
            </Button>
          }
        />
      }
    />
  )
}
