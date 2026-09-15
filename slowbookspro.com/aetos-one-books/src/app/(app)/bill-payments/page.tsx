import Link from 'next/link'
import { WalletIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import type { Prisma } from '@/generated/tenant/client'
import { BillPaymentTable, type BillPaymentRow } from './payment-table'

export const metadata = { title: 'Bill payments' }

const SORTABLE = ['date', 'amount'] as const

export default async function BillPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'posted'
  const vendorId = typeof params.vendor === 'string' ? Number.parseInt(params.vendor, 10) : null

  const where: Prisma.BillPaymentWhereInput = {
    ...(show === 'posted' ? { isVoided: false } : show === 'void' ? { isVoided: true } : {}),
    ...(vendorId && Number.isFinite(vendorId) ? { vendorId } : {}),
    ...(q
      ? {
          OR: [
            { vendor: { name: { contains: q, mode: 'insensitive' as const } } },
            { method: { contains: q, mode: 'insensitive' as const } },
            { checkNumber: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.BillPaymentOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [payments, total] = await Promise.all([
    db.billPayment.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        vendor: { select: { id: true, name: true } },
        payFromAccount: { select: { name: true } },
        billPaymentAllocations: { select: { id: true } },
      },
    }),
    db.billPayment.count({ where }),
  ])

  const rows: BillPaymentRow[] = payments.map((payment) => ({
    id: payment.id,
    date: payment.date.toISOString().slice(0, 10),
    vendorId: payment.vendor.id,
    vendorName: payment.vendor.name,
    method: payment.method,
    checkNumber: payment.checkNumber,
    payFrom: payment.payFromAccount?.name ?? '—',
    billCount: payment.billPaymentAllocations.length,
    amount: formatMoney(payment.amount.toString(), currency),
    isVoided: payment.isVoided,
  }))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Bill payments"
        description="Money that has gone out to vendors, and which bills each payment settled."
        actions={
          <Button asChild size="sm">
            <Link href="/bill-payments/new"><WalletIcon /> Pay bills</Link>
          </Button>
        }
      />
      <BillPaymentTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex items-center gap-1" role="group" aria-label="Filter payments">
            {(
              [
                ['posted', 'Posted'],
                ['void', 'Voided'],
                ['all', 'All'],
              ] as const
            ).map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/bill-payments?show=${value}`}
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
