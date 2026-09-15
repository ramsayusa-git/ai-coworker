import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { CreditMemoTable, type CreditMemoRow } from './credit-memo-table'

export const metadata = { title: 'Credit memos' }

const SORTABLE = ['memoNumber', 'date', 'status', 'total', 'balanceRemaining'] as const

const FILTERS = [
  ['open', 'Unapplied'],
  ['applied', 'Fully applied'],
  ['writeoff', 'Write-offs'],
  ['void', 'Voided'],
  ['all', 'All'],
] as const

export default async function CreditMemosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'open'
  const customerId =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : null

  const statusFilter: Prisma.CreditMemoWhereInput =
    show === 'open'
      ? { status: 'ISSUED', balanceRemaining: { gt: 0 } }
      : show === 'applied'
        ? { status: 'APPLIED' }
        : show === 'writeoff'
          ? { isWriteOff: true }
          : show === 'void'
            ? { status: 'VOID' }
            : {}

  const where: Prisma.CreditMemoWhereInput = {
    ...statusFilter,
    ...(customerId && Number.isFinite(customerId) ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            { memoNumber: { contains: q, mode: 'insensitive' as const } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'date'
  const orderBy: Prisma.CreditMemoOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'desc' }]

  const [memos, total, live] = await Promise.all([
    db.creditMemo.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { customer: { select: { id: true, name: true } } },
    }),
    db.creditMemo.count({ where }),
    db.creditMemo.findMany({
      where: { status: { not: 'VOID' } },
      select: { total: true, balanceRemaining: true, isWriteOff: true },
    }),
  ])

  const outstandingCredit = sum(live.map((row) => money(row.balanceRemaining.toString())))
  const writtenOff = sum(
    live.filter((row) => row.isWriteOff).map((row) => money(row.total.toString())),
  )

  const rows: CreditMemoRow[] = memos.map((memo) => ({
    id: memo.id,
    memoNumber: memo.memoNumber,
    customerName: memo.customer.name,
    date: memo.date.toISOString().slice(0, 10),
    status: memo.status,
    isWriteOff: memo.isWriteOff,
    total: formatMoney(memo.total.toString(), currency),
    remaining: formatMoney(memo.balanceRemaining.toString(), currency),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Credit memos"
        description="Value given back to a customer. Applying a credit moves it onto an invoice; it posts nothing further."
        actions={
          <Button asChild size="sm">
            <Link href="/credit-memos/new">
              <PlusIcon /> New credit memo
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Credit still unapplied</p>
            <p className="num mt-1 text-xl font-semibold">
              {formatMoney(outstandingCredit, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Written off to bad debt</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(writtenOff, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Showing</p>
            <p className="num mt-1 text-xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <CreditMemoTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Filter credit memos"
          >
            {FILTERS.map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/credit-memos?show=${value}${customerId ? `&customer=${customerId}` : ''}`}
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
