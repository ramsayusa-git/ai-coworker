import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { cents, formatMoney, money, sum } from '@/lib/money'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { PaymentTable, type PaymentRow } from './payment-table'

export const metadata = { title: 'Payments received' }

const SORTABLE = ['date', 'amount'] as const

const FILTERS = [
  ['recorded', 'Recorded'],
  ['unapplied', 'Unapplied'],
  ['voided', 'Voided'],
  ['all', 'All'],
] as const

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'recorded'
  const customerId =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : null

  const statusFilter: Prisma.PaymentWhereInput =
    show === 'recorded'
      ? { isVoided: false }
      : show === 'voided'
        ? { isVoided: true }
        : show === 'unapplied'
          ? { isVoided: false, paymentAllocations: { none: {} } }
          : {}

  const where: Prisma.PaymentWhereInput = {
    ...statusFilter,
    ...(customerId && Number.isFinite(customerId) ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' as const } },
            { checkNumber: { contains: q, mode: 'insensitive' as const } },
            { method: { contains: q, mode: 'insensitive' as const } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [payments, total, live] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true } },
        paymentAllocations: { select: { amount: true } },
      },
    }),
    db.payment.count({ where }),
    db.payment.findMany({
      where: { isVoided: false },
      select: { amount: true, paymentAllocations: { select: { amount: true } } },
    }),
  ])

  const received = sum(live.map((row) => money(row.amount.toString())))
  const unappliedTotal = sum(
    live.map((row) =>
      cents(
        money(row.amount.toString()).minus(
          sum(row.paymentAllocations.map((a) => money(a.amount.toString()))),
        ),
      ),
    ),
  )

  const rows: PaymentRow[] = payments.map((payment) => {
    const applied = cents(
      sum(payment.paymentAllocations.map((a) => money(a.amount.toString()))),
    )
    const unapplied = cents(money(payment.amount.toString()).minus(applied))
    return {
      id: payment.id,
      customerName: payment.customer.name,
      date: payment.date.toISOString().slice(0, 10),
      amount: formatMoney(payment.amount.toString(), currency),
      applied: formatMoney(applied, currency),
      unapplied: unapplied.isPositive() ? formatMoney(unapplied, currency) : '—',
      method: payment.method,
      reference: payment.reference ?? payment.checkNumber,
      invoiceCount: payment.paymentAllocations.length,
      isVoided: payment.isVoided,
    }
  })

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Payments received"
        description="Every payment relieves accounts receivable in full; what is not matched to an invoice stays as a credit."
        actions={
          <Button asChild size="sm">
            <Link href="/payments/new">
              <PlusIcon /> Receive payment
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Received, all time</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(received, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Still unapplied</p>
            <p className="num mt-1 text-xl font-semibold">
              {formatMoney(unappliedTotal, currency)}
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

      <PaymentTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Filter payments"
          >
            {FILTERS.map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/payments?show=${value}${customerId ? `&customer=${customerId}` : ''}`}
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
