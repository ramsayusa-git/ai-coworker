'use client'
import Link from 'next/link'
import { UsersIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type CustomerRow = {
  id: number
  name: string
  companyName: string | null
  email: string | null
  phone: string | null
  terms: string | null
  isActive: boolean
  openBalance: string
  overdue: boolean
}

export function CustomerTable({
  rows,
  total,
  page,
  pageSize,
  noun,
  toolbar,
}: {
  rows: CustomerRow[]
  total: number
  page: number
  pageSize: number
  noun: string
  toolbar?: React.ReactNode
}) {
  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          {row.companyName && row.companyName !== row.name && (
            <p className="text-muted-foreground truncate text-xs">{row.companyName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortKey: 'email',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{row.email ?? '—'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.phone ?? '—'}</span>,
    },
    {
      key: 'terms',
      header: 'Terms',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.terms ?? 'Net 30'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isActive ? (
          <Badge variant="muted">Active</Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        ),
    },
    {
      key: 'balance',
      header: 'Open balance',
      numeric: true,
      render: (row) => (
        <span className={row.overdue ? 'text-destructive font-medium' : undefined}>
          {row.openBalance}
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
      rowHref={(row) => `/customers/${row.id}`}
      searchPlaceholder={`Search ${noun}s by name, company or email…`}
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={UsersIcon}
          title={`No ${noun}s yet`}
          description={`Add the people and organisations you invoice. Everything on the sales side starts with a ${noun}.`}
          action={
            <Button asChild size="sm">
              <Link href="/customers/new">New {noun}</Link>
            </Button>
          }
        />
      }
    />
  )
}
