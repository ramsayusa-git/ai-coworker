import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { startOfToday } from '@/server/sales'
import { formatMoney, money, sum } from '@/lib/money'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { EstimateTable, type EstimateRow } from './estimate-table'

export const metadata = { title: 'Estimates' }

const SORTABLE = ['estimateNumber', 'date', 'expirationDate', 'status', 'total'] as const

const FILTERS = [
  ['pending', 'Pending'],
  ['accepted', 'Accepted'],
  ['converted', 'Converted'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
] as const

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'pending'
  const customerId =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : null
  const today = startOfToday()

  const statusFilter: Prisma.EstimateWhereInput =
    show === 'pending'
      ? { status: 'PENDING' }
      : show === 'accepted'
        ? { status: 'ACCEPTED' }
        : show === 'converted'
          ? { status: 'CONVERTED' }
          : show === 'rejected'
            ? { status: 'REJECTED' }
            : {}

  const where: Prisma.EstimateWhereInput = {
    ...statusFilter,
    ...(customerId && Number.isFinite(customerId) ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            { estimateNumber: { contains: q, mode: 'insensitive' as const } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.EstimateOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [estimates, total, pipeline] = await Promise.all([
    db.estimate.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { customer: { select: { id: true, name: true } } },
    }),
    db.estimate.count({ where }),
    db.estimate.findMany({
      where: { status: { in: ['PENDING', 'ACCEPTED'] } },
      select: { total: true, status: true },
    }),
  ])

  const open = sum(pipeline.map((row) => money(row.total.toString())))
  const accepted = sum(
    pipeline.filter((row) => row.status === 'ACCEPTED').map((row) => money(row.total.toString())),
  )

  const rows: EstimateRow[] = estimates.map((estimate) => ({
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    customerName: estimate.customer.name,
    date: estimate.date.toISOString().slice(0, 10),
    expirationDate: estimate.expirationDate
      ? estimate.expirationDate.toISOString().slice(0, 10)
      : null,
    expired:
      estimate.status === 'PENDING' &&
      estimate.expirationDate !== null &&
      estimate.expirationDate.getTime() < today.getTime(),
    status: estimate.status,
    total: formatMoney(estimate.total.toString(), currency),
    convertedInvoiceId: estimate.convertedInvoiceId,
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Estimates"
        description="Work you have quoted but not yet billed. Converting one writes the invoice and posts it."
        actions={
          <Button asChild size="sm">
            <Link href="/estimates/new">
              <PlusIcon /> New estimate
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Quoted and still open</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(open, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Accepted, not yet invoiced</p>
            <p className="num text-positive mt-1 text-xl font-semibold">
              {formatMoney(accepted, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Showing</p>
            <p className="num mt-1 text-xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <EstimateTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Filter estimates"
          >
            {FILTERS.map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/estimates?show=${value}${customerId ? `&customer=${customerId}` : ''}`}
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
