'use client'
import Link from 'next/link'
import { BoxesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/app/data-table'
import { EmptyState } from '@/components/app/page-header'

export type ItemRow = {
  id: number
  name: string
  itemType: string
  description: string | null
  rate: string
  isActive: boolean
  trackInventory: boolean
  onHand: string | null
  lowStock: boolean
  value: string | null
}

const TYPE_LABEL: Record<string, string> = {
  PRODUCT: 'Product',
  SERVICE: 'Service',
  MATERIAL: 'Material',
  LABOR: 'Labour',
}

export function ItemTable({
  rows,
  total,
  page,
  pageSize,
  toolbar,
}: {
  rows: ItemRow[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
}) {
  const columns: Column<ItemRow>[] = [
    {
      key: 'name',
      header: 'Item',
      sortKey: 'name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          {row.description && (
            <p className="text-muted-foreground truncate text-xs">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortKey: 'itemType',
      hideBelow: 'sm',
      render: (row) => <Badge variant="muted">{TYPE_LABEL[row.itemType] ?? row.itemType}</Badge>,
    },
    {
      key: 'rate',
      header: 'Price',
      sortKey: 'rate',
      numeric: true,
      render: (row) => row.rate,
    },
    {
      key: 'onHand',
      header: 'On hand',
      numeric: true,
      hideBelow: 'md',
      render: (row) =>
        row.trackInventory ? (
          <span className={row.lowStock ? 'text-destructive font-medium' : undefined}>
            {row.onHand}
            {row.lowStock && <span className="sr-only"> — at or below the reorder point</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'value',
      header: 'Stock value',
      numeric: true,
      hideBelow: 'lg',
      render: (row) => row.value ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isActive ? <Badge variant="muted">Active</Badge> : <Badge variant="outline">Inactive</Badge>,
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
      rowHref={(row) => `/items/${row.id}`}
      searchPlaceholder="Search items by name or description…"
      toolbar={toolbar}
      empty={
        <EmptyState
          icon={BoxesIcon}
          title="No items yet"
          description="Items are the products and services you put on invoices. Tracked products also carry their cost through to cost of goods sold."
          action={
            <Button asChild size="sm">
              <Link href="/items/new">New item</Link>
            </Button>
          }
        />
      }
    />
  )
}
