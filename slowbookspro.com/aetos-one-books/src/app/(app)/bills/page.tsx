import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { BillTable, type BillRow } from './bill-table'
import { isBillOverdue } from './bill-status'

export const metadata = { title: 'Bills' }

const SORTABLE = ['billNumber', 'date', 'dueDate', 'status', 'total', 'balanceDue'] as const

const FILTERS = [
  ['open', 'Open'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
  ['all', 'All'],
] as const

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'open'
  const vendorId = typeof params.vendor === 'string' ? Number.parseInt(params.vendor, 10) : null
  const today = new Date()
  const startOfToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )

  const statusFilter: Prisma.BillWhereInput =
    show === 'open'
      ? { status: { in: ['UNPAID', 'PARTIAL'] }, balanceDue: { gt: 0 } }
      : show === 'overdue'
        ? {
            status: { in: ['UNPAID', 'PARTIAL'] },
            balanceDue: { gt: 0 },
            dueDate: { lt: startOfToday },
          }
        : show === 'paid'
          ? { status: 'PAID' }
          : {}

  const where: Prisma.BillWhereInput = {
    ...statusFilter,
    ...(vendorId && Number.isFinite(vendorId) ? { vendorId } : {}),
    ...(q
      ? {
          OR: [
            { billNumber: { contains: q, mode: 'insensitive' as const } },
            { refNumber: { contains: q, mode: 'insensitive' as const } },
            { vendor: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.BillOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [bills, total, openBills] = await Promise.all([
    db.bill.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { vendor: { select: { id: true, name: true } } },
    }),
    db.bill.count({ where }),
    db.bill.findMany({
      where: { status: { in: ['UNPAID', 'PARTIAL'] }, balanceDue: { gt: 0 } },
      select: { balanceDue: true, dueDate: true, status: true },
    }),
  ])

  const outstanding = sum(openBills.map((row) => money(row.balanceDue.toString())))
  const overdueTotal = sum(
    openBills
      .filter((row) => isBillOverdue(row.dueDate, row.balanceDue, row.status))
      .map((row) => money(row.balanceDue.toString())),
  )

  const rows: BillRow[] = bills.map((bill) => ({
    id: bill.id,
    billNumber: bill.billNumber,
    vendorId: bill.vendor.id,
    vendorName: bill.vendor.name,
    date: bill.date.toISOString().slice(0, 10),
    dueDate: bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : null,
    status: bill.status,
    overdue: isBillOverdue(bill.dueDate, bill.balanceDue, bill.status),
    total: formatMoney(bill.total.toString(), currency),
    balanceDue: formatMoney(bill.balanceDue.toString(), currency),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Bills"
        description="What you have been billed, what is still owed and what has gone past its due date."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/bill-payments/new">Pay bills</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/bills/new"><PlusIcon /> New bill</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Outstanding</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(outstanding, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Overdue</p>
            <p
              className={`num mt-1 text-xl font-semibold ${
                overdueTotal.greaterThan(0) ? 'text-destructive' : ''
              }`}
            >
              {formatMoney(overdueTotal, currency)}
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

      <BillTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter bills">
            {FILTERS.map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/bills?show=${value}${vendorId ? `&vendor=${vendorId}` : ''}`}
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
