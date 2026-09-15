'use client'
import Link from 'next/link'
import { HandCoinsIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type PaymentRow = {
  id: number
  customerName: string
  date: string
  amount: string
  applied: string
  unapplied: string
  method: string | null
  reference: string | null
  invoiceCount: number
  isVoided: boolean
}

export function PaymentTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: PaymentRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<PaymentRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      render: (row) => <span className="whitespace-nowrap font-medium">{row.date}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => <span className="truncate">{row.customerName}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      hideBelow: 'sm',
      render: (row) => (
        <span className="text-muted-foreground">
          {row.method ?? '—'}
          {row.reference ? ` · ${row.reference}` : ''}
        </span>
      ),
    },
    {
      key: 'applied',
      header: 'Applied to',
      hideBelow: 'md',
      render: (row) =>
        row.invoiceCount === 0 ? (
          <Badge variant="warning">Unapplied</Badge>
        ) : (
          <span className="text-muted-foreground">
            {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isVoided ? <Badge variant="destructive">Void</Badge> : <Badge variant="success">Recorded</Badge>,
    },
    {
      key: 'unapplied',
      header: 'Unapplied',
      numeric: true,
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.unapplied}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortKey: 'amount',
      numeric: true,
      render: (row) => (
        <span className={row.isVoided ? 'text-muted-foreground line-through' : 'font-medium'}>
          {row.amount}
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
      rowHref={(row) => `/payments/${row.id}`}
      searchPlaceholder="Search by customer, reference or check number…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={HandCoinsIcon}
          title="No payments received yet"
          description="Recording a payment debits the deposit account and relieves accounts receivable for the full amount, applied or not."
          action={
            <Button asChild size="sm">
              <Link href="/payments/new">Receive payment</Link>
            </Button>
          }
        />
      }
    />
  )
}
