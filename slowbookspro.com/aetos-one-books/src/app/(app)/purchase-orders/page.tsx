import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import type { Prisma } from '@/generated/tenant/client'
import { PurchaseOrderTable, type PurchaseOrderRow } from './po-table'

export const metadata = { title: 'Purchase orders' }

const SORTABLE = ['poNumber', 'date', 'status', 'total'] as const

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'open'

  const where: Prisma.PurchaseOrderWhereInput = {
    ...(show === 'open'
      ? { status: { in: ['DRAFT', 'SENT', 'PARTIAL'] } }
      : show === 'received'
        ? { status: 'RECEIVED' }
        : show === 'billed'
          ? { status: 'CLOSED' }
          : {}),
    ...(q
      ? {
          OR: [
            { poNumber: { contains: q, mode: 'insensitive' as const } },
            { vendor: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.PurchaseOrderOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [orders, total] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { vendor: { select: { name: true } } },
    }),
    db.purchaseOrder.count({ where }),
  ])

  const rows: PurchaseOrderRow[] = orders.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    vendorName: po.vendor.name,
    date: po.date.toISOString().slice(0, 10),
    expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : null,
    status: po.status,
    total: formatMoney(po.total.toString(), currency),
  }))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Purchase orders"
        description="What you have ordered and what has turned up. An order posts nothing until it becomes a bill."
        actions={
          <Button asChild size="sm">
            <Link href="/purchase-orders/new"><PlusIcon /> New purchase order</Link>
          </Button>
        }
      />
      <PurchaseOrderTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter purchase orders">
            {(
              [
                ['open', 'Open'],
                ['received', 'Received'],
                ['billed', 'Billed'],
                ['all', 'All'],
              ] as const
            ).map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/purchase-orders?show=${value}`}
                  aria-current={show === value ? 'true' : undefined}
                >
                  {text}
                </Link>
              </Button>
            ))}
          </div>
        }
      />
    </div>
  )
}
