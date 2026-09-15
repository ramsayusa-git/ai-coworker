'use client'
import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DataTable, type Column } from '@/components/app/data-table'

export type JournalRow = {
  id: number
  date: string
  description: string
  reference: string
  sourceType: string
  amount: string
  accounts: string[]
  lineCount: number
  isVoided: boolean
  isReversal: boolean
  reconciled: boolean
}

const SOURCES = [
  { value: 'manual', label: 'Manual entries' },
  { value: 'all', label: 'Everything' },
  { value: 'bank_entry', label: 'Register entries' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'opening_balance', label: 'Opening balances' },
]

export function JournalTable({
  rows,
  total,
  page,
  pageSize,
  source,
  empty,
}: {
  rows: JournalRow[]
  total: number
  page: number
  pageSize: number
  source: string
  empty: React.ReactNode
}) {
  const router = useRouter()
  const params = useSearchParams()

  const setSource = (value: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('source', value)
    next.delete('page')
    router.push(`?${next.toString()}`, { scroll: false })
  }

  const columns: Column<JournalRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      width: '7.5rem',
      render: (row) => <span className="whitespace-nowrap">{row.date}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{row.description || '—'}</span>
          {row.isVoided && <Badge variant="destructive">Reversed</Badge>}
          {row.isReversal && <Badge variant="muted">Reversal</Badge>}
          {row.reconciled && <Badge variant="success">Reconciled</Badge>}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{row.reference || '—'}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      sortKey: 'source',
      hideBelow: 'sm',
      render: (row) => <Badge variant="muted">{row.sourceType}</Badge>,
    },
    {
      key: 'accounts',
      header: 'Accounts',
      hideBelow: 'lg',
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {row.accounts.slice(0, 2).join(' → ')}
          {row.lineCount > 2 && ` +${row.lineCount - 2}`}
        </span>
      ),
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
      rowHref={(row) => `/journal/${row.id}`}
      searchPlaceholder="Search descriptions and references…"
      empty={empty}
      toolbar={
        <div className="flex items-center gap-2">
          <Label htmlFor="journal-source" className="text-muted-foreground text-xs">
            Show
          </Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="journal-source" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  )
}
