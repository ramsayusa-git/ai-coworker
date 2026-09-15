import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { VendorCreditTable, type VendorCreditRow } from './credit-table'

export const metadata = { title: 'Vendor credits' }

const SORTABLE = ['creditNumber', 'date', 'status', 'total', 'balanceRemaining'] as const

export default async function VendorCreditsPage({
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

  const where: Prisma.VendorCreditWhereInput = {
    ...(show === 'open'
      ? { status: 'ISSUED', balanceRemaining: { gt: 0 } }
      : show === 'applied'
        ? { status: 'APPLIED' }
        : show === 'void'
          ? { status: 'VOID' }
          : {}),
    ...(vendorId && Number.isFinite(vendorId) ? { vendorId } : {}),
    ...(q
      ? {
          OR: [
            { creditNumber: { contains: q, mode: 'insensitive' as const } },
            { refNumber: { contains: q, mode: 'insensitive' as const } },
            { vendor: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.VendorCreditOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [credits, total, openCredits] = await Promise.all([
    db.vendorCredit.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { vendor: { select: { name: true } } },
    }),
    db.vendorCredit.count({ where }),
    db.vendorCredit.findMany({
      where: { status: 'ISSUED', balanceRemaining: { gt: 0 } },
      select: { balanceRemaining: true },
    }),
  ])

  const unapplied = sum(openCredits.map((row) => money(row.balanceRemaining.toString())))

  const rows: VendorCreditRow[] = credits.map((credit) => ({
    id: credit.id,
    creditNumber: credit.creditNumber,
    vendorName: credit.vendor.name,
    date: credit.date.toISOString().slice(0, 10),
    refNumber: credit.refNumber,
    status: credit.status,
    total: formatMoney(credit.total.toString(), currency),
    balanceRemaining: formatMoney(credit.balanceRemaining.toString(), currency),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Vendor credits"
        description="Money a vendor owes you back — a return, an overcharge, a rebate — and what is still unapplied."
        actions={
          <Button asChild size="sm">
            <Link href="/vendor-credits/new"><PlusIcon /> New vendor credit</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Unapplied credit</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(unapplied, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Showing</p>
            <p className="num mt-1 text-xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <VendorCreditTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter credits">
            {(
              [
                ['open', 'Open'],
                ['applied', 'Applied'],
                ['void', 'Voided'],
                ['all', 'All'],
              ] as const
            ).map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/vendor-credits?show=${value}`}
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
