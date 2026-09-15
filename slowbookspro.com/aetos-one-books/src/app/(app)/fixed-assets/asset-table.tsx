'use client'
import Link from 'next/link'
import { Building2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type AssetRow = {
  id: number
  assetNumber: string
  name: string
  typeName: string
  method: string
  purchaseDate: string
  status: string
  cost: string
  accumulated: string
  bookValue: string
}

export function AssetTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: AssetRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<AssetRow>[] = [
    {
      key: 'number',
      header: 'Asset',
      sortKey: 'assetNumber',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.assetNumber}</p>
          <p className="text-muted-foreground truncate text-xs">{row.name}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideBelow: 'sm',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.typeName}</p>
          <p className="text-muted-foreground truncate text-xs">{row.method}</p>
        </div>
      ),
    },
    {
      key: 'purchased',
      header: 'Purchased',
      sortKey: 'purchaseDate',
      hideBelow: 'md',
      render: (row) => <span className="whitespace-nowrap">{row.purchaseDate}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) =>
        row.status === 'DISPOSED' ? (
          <Badge variant="outline">Disposed</Badge>
        ) : (
          <Badge variant="muted">In service</Badge>
        ),
    },
    { key: 'cost', header: 'Cost', numeric: true, hideBelow: 'lg', render: (row) => row.cost },
    {
      key: 'accumulated',
      header: 'Depreciation',
      numeric: true,
      hideBelow: 'md',
      render: (row) => row.accumulated,
    },
    { key: 'book', header: 'Book value', numeric: true, render: (row) => row.bookValue },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      total={total}
      page={page}
      pageSize={pageSize}
      rowKey={(row) => row.id}
      rowHref={(row) => `/fixed-assets/${row.id}`}
      searchPlaceholder="Search assets by number or name…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={Building2Icon}
          title="Nothing in the register"
          description="Register what you bought and the monthly write-down takes care of itself: depreciation expense is debited and accumulated depreciation credited, one entry per asset."
          action={
            <Button asChild size="sm">
              <Link href="/fixed-assets/new">Register an asset</Link>
            </Button>
          }
        />
      }
    />
  )
}
