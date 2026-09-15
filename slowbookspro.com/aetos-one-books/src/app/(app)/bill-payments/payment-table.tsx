'use client'
import Link from 'next/link'
import { WalletIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type BillPaymentRow = {
  id: number
  date: string
  vendorId: number
  vendorName: string
  method: string | null
  checkNumber: string | null
  payFrom: string
  billCount: number
  amount: string
  isVoided: boolean
}

export function BillPaymentTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: BillPaymentRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<BillPaymentRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      render: (row) => <span className="font-medium whitespace-nowrap">{row.date}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor',
      render: (row) => <span className="truncate">{row.vendorName}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      hideBelow: 'sm',
      render: (row) => <span className="text-muted-foreground">{row.method ?? '—'}</span>,
    },
    {
      key: 'check',
      header: 'Check',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{row.checkNumber ?? '—'}</span>,
    },
    {
      key: 'payFrom',
      header: 'Paid from',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.payFrom}</span>,
    },
    {
      key: 'bills',
      header: 'Bills',
      numeric: true,
      hideBelow: 'md',
      render: (row) => row.billCount,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isVoided ? <Badge variant="destructive">Void</Badge> : <Badge variant="success">Posted</Badge>,
    },
    { key: 'amount', header: 'Amount', sortKey: 'amount', numeric: true, render: (row) => row.amount },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      total={total}
      page={page}
      pageSize={pageSize}
      rowKey={(row) => row.id}
      rowHref={(row) => `/bill-payments/${row.id}`}
      searchPlaceholder="Search by vendor, method or check number…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={WalletIcon}
          title="No payments yet"
          description="Paying a bill debits accounts payable and credits the account the money came out of. Start from the pay-bills screen and settle a whole vendor at once."
          action={
            <Button asChild size="sm">
              <Link href="/bill-payments/new">Pay bills</Link>
            </Button>
          }
        />
      }
    />
  )
}
