'use client'
import Link from 'next/link'
import { ScrollTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'
import { VendorCreditStatusBadge } from '../bills/bill-status'

export type VendorCreditRow = {
  id: number
  creditNumber: string
  vendorName: string
  date: string
  refNumber: string | null
  status: string
  total: string
  balanceRemaining: string
}

export function VendorCreditTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: VendorCreditRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<VendorCreditRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortKey: 'creditNumber',
      render: (row) => <span className="font-medium">{row.creditNumber}</span>,
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
      key: 'ref',
      header: 'Their reference',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.refNumber ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <VendorCreditStatusBadge status={row.status} />,
    },
    { key: 'total', header: 'Total', sortKey: 'total', numeric: true, render: (row) => row.total },
    {
      key: 'remaining',
      header: 'Unapplied',
      sortKey: 'balanceRemaining',
      numeric: true,
      render: (row) => row.balanceRemaining,
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
      rowHref={(row) => `/vendor-credits/${row.id}`}
      searchPlaceholder="Search by number, reference or vendor…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={ScrollTextIcon}
          title="No vendor credits yet"
          description="A vendor credit is a bill in reverse: accounts payable is debited and the expense credited back. Applying one to a bill posts nothing more."
          action={
            <Button asChild size="sm">
              <Link href="/vendor-credits/new">New vendor credit</Link>
            </Button>
          }
        />
      }
    />
  )
}
