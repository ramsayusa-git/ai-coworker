'use client'
import Link from 'next/link'
import { CreditCardIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type ExpenseRow = {
  id: number
  date: string
  kind: 'expense' | 'card'
  payee: string
  account: string
  paidFrom: string
  reference: string | null
  amount: string
  isVoided: boolean
}

export function ExpenseTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: ExpenseRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<ExpenseRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      render: (row) => <span className="font-medium whitespace-nowrap">{row.date}</span>,
    },
    {
      key: 'kind',
      header: 'Type',
      hideBelow: 'sm',
      render: (row) => (
        <Badge variant="outline">{row.kind === 'card' ? 'Card charge' : 'Expense'}</Badge>
      ),
    },
    { key: 'payee', header: 'Payee', render: (row) => <span className="truncate">{row.payee}</span> },
    {
      key: 'account',
      header: 'Spent on',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{row.account}</span>,
    },
    {
      key: 'paidFrom',
      header: 'Paid from',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.paidFrom}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.reference ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isVoided ? <Badge variant="destructive">Void</Badge> : <Badge variant="success">Posted</Badge>,
    },
    { key: 'amount', header: 'Amount', numeric: true, render: (row) => row.amount },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      total={total}
      page={page}
      pageSize={pageSize}
      rowKey={(row) => row.id}
      rowHref={(row) => `/expenses/${row.id}`}
      searchPlaceholder="Search by payee, memo or reference…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={CreditCardIcon}
          title="Nothing recorded yet"
          description="An expense is money already gone: the account you spent on is debited and the bank or card is credited. There is no document behind it — the journal entry is the document."
          action={
            <Button asChild size="sm">
              <Link href="/expenses/new">Record spending</Link>
            </Button>
          }
        />
      }
    />
  )
}
