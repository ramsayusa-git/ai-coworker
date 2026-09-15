import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { cents, formatMoney, qty } from '@/lib/money'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import type { Prisma } from '@/generated/tenant/client'
import { ItemTable, type ItemRow } from './item-table'

export const metadata = { title: 'Items' }

const SORTABLE = ['name', 'itemType', 'rate', 'quantityOnHand'] as const

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'name', dir: 'asc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'active'

  const where: Prisma.ItemWhereInput = {
    ...(show === 'active' ? { isActive: true } : show === 'inactive' ? { isActive: false } : {}),
    ...(show === 'tracked' ? { trackInventory: true, isActive: true } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'name'
  const orderBy = { [field]: dir } as Prisma.ItemOrderByWithRelationInput

  const [items, total] = await Promise.all([
    db.item.findMany({ where, orderBy, skip, take: pageSize }),
    db.item.count({ where }),
  ])

  const rows: ItemRow[] = items.map((item) => {
    const onHand = qty(item.quantityOnHand.toString())
    const avgCost = qty(item.avgCost.toString())
    const reorder = qty(item.reorderPoint.toString())
    return {
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      description: item.description,
      rate: formatMoney(item.rate.toString(), currency),
      isActive: item.isActive,
      trackInventory: item.trackInventory,
      onHand: item.trackInventory ? onHand.toFixed(2) : null,
      lowStock:
        item.trackInventory &&
        (onHand.isNegative() || (reorder.isPositive() && onHand.lessThanOrEqualTo(reorder))),
      value: item.trackInventory
        ? formatMoney(cents(onHand.times(avgCost)), currency)
        : null,
    }
  })

  const tracked = await db.item.aggregate({
    where: { trackInventory: true, isActive: true },
    _count: true,
  })

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Items"
        description={`Products and services you sell${
          tracked._count ? ` — ${tracked._count} of them stocked and costed` : ''
        }.`}
        actions={
          <Button asChild size="sm">
            <Link href="/items/new"><PlusIcon /> New item</Link>
          </Button>
        }
      />
      <ItemTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex items-center gap-1" role="group" aria-label="Filter items">
            {(
              [
                ['active', 'Active'],
                ['tracked', 'Stocked'],
                ['all', 'All'],
                ['inactive', 'Inactive'],
              ] as const
            ).map(([value, label]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link href={`/items?show=${value}`} aria-current={show === value ? 'true' : undefined}>
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        }
      />
      <p className="text-muted-foreground mt-3 text-xs">
        Stock value is quantity on hand × weighted-average cost, the same figure the inventory
        asset account carries.
      </p>
    </div>
  )
}
