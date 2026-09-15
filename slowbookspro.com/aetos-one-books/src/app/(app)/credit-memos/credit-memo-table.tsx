'use client'
import Link from 'next/link'
import { ScrollTextIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { DocumentStatus } from '@/components/app/document-status'
import { EmptyState } from '@/components/app/page-header'

export type CreditMemoRow = {
  id: number
  memoNumber: string
  customerName: string
  date: string
  status: string
  isWriteOff: boolean
  total: string
  remaining: string
}

export function CreditMemoTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: CreditMemoRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<CreditMemoRow>[] = [
    {
      key: 'number',
      header: 'Number',
      sortKey: 'memoNumber',
      render: (row) => <span className="font-medium">{row.memoNumber}</span>,
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
      key: 'kind',
      header: 'Kind',
      hideBelow: 'md',
      render: (row) =>
        row.isWriteOff ? <Badge variant="warning">Write-off</Badge> : <Badge variant="muted">Credit</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <DocumentStatus kind="creditMemo" status={row.status} />,
    },
    { key: 'total', header: 'Total', sortKey: 'total', numeric: true, render: (row) => row.total },
    {
      key: 'remaining',
      header: 'Unapplied',
      sortKey: 'balanceRemaining',
      numeric: true,
      render: (row) => <span className="font-medium">{row.remaining}</span>,
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
      rowHref={(row) => `/credit-memos/${row.id}`}
      searchPlaceholder="Search by number or customer…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={ScrollTextIcon}
          title="No credit memos yet"
          description="A credit memo posts the moment it is issued and then waits, unapplied, until you put it against an invoice."
          action={
            <Button asChild size="sm">
              <Link href="/credit-memos/new">New credit memo</Link>
            </Button>
          }
        />
      }
    />
  )
}
