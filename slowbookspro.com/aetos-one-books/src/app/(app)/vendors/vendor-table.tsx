'use client'
import Link from 'next/link'
import { TruckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type VendorRow = {
  id: number
  name: string
  companyName: string | null
  email: string | null
  phone: string | null
  terms: string | null
  is1099: boolean
  isActive: boolean
  openBalance: string
  overdue: boolean
}

export function VendorTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: VendorRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<VendorRow>[] = [
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
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.isActive ? (
            <Badge variant="muted">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )}
          {row.is1099 && <Badge variant="outline">1099</Badge>}
        </div>
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
      rowHref={(row) => `/vendors/${row.id}`}
      searchPlaceholder="Search vendors by name, company or email…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={TruckIcon}
          title="No vendors yet"
          description="Everyone you buy from. A bill, a purchase order and a 1099 all start with a vendor."
          action={
            <Button asChild size="sm">
              <Link href="/vendors/new">New vendor</Link>
            </Button>
          }
        />
      }
    />
  )
}
