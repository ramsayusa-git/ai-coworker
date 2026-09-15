import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prisma } from '@/generated/tenant/client'
import { ExpenseTable, type ExpenseRow } from './expense-table'

export const metadata = { title: 'Expenses' }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'all'
  const sourceTypes =
    show === 'card' ? ['cc_charge'] : show === 'expense' ? ['expense'] : ['expense', 'cc_charge']

  const where: Prisma.TransactionWhereInput = {
    sourceType: { in: sourceTypes },
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: 'insensitive' as const } },
            { reference: { contains: q, mode: 'insensitive' as const } },
            {
              transactionLines: {
                some: { description: { contains: q, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}),
  }

  const [entries, total, everything] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ date: dir }, { id: 'desc' }],
      skip,
      take: pageSize,
      include: { transactionLines: { include: { account: true } } },
    }),
    db.transaction.count({ where }),
    db.transaction.findMany({
      where: { sourceType: { in: ['expense', 'cc_charge'] }, isVoided: false },
      select: { transactionLines: { select: { debit: true } } },
    }),
  ])

  const spent = sum(
    everything.flatMap((entry) => entry.transactionLines.map((line) => money(line.debit.toString()))),
  )

  const rows: ExpenseRow[] = entries.map((entry) => {
    // The debit side is what was spent on; the credit side is where it came
    // from. Reading them off the entry keeps the list honest even for an entry
    // someone edited in the journal.
    const debit = entry.transactionLines.find((line) => !money(line.debit.toString()).isZero())
    const credit = entry.transactionLines.find((line) => !money(line.credit.toString()).isZero())
    // "Expense: Acme" and "Card charge: Acme" carry the payee in the
    // description; a bare "Expense" has none.
    const description = (entry.description ?? '').trim()
    const payee =
      description.replace(/^(Expense|Card charge):\s*/, '').trim() ||
      '\u2014'
    return {
      id: entry.id,
      date: entry.date.toISOString().slice(0, 10),
      kind: entry.sourceType === 'cc_charge' ? ('card' as const) : ('expense' as const),
      payee: payee === 'Expense' || payee === 'Credit card charge' ? '\u2014' : payee,
      account: debit?.account.name ?? '—',
      paidFrom: credit?.account.name ?? '—',
      reference: entry.reference,
      amount: formatMoney(debit?.debit.toString() ?? 0, currency),
      isVoided: entry.isVoided,
    }
  })

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Expenses and card charges"
        description="Money already spent, with no bill behind it. The journal entry is the document."
        actions={
          <Button asChild size="sm">
            <Link href="/expenses/new"><PlusIcon /> Record spending</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Recorded, all time</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(spent, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Showing</p>
            <p className="num mt-1 text-xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <ExpenseTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex items-center gap-1" role="group" aria-label="Filter spending">
            {(
              [
                ['all', 'All'],
                ['expense', 'Expenses'],
                ['card', 'Card charges'],
              ] as const
            ).map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link href={`/expenses?show=${value}`} aria-current={show === value ? 'true' : undefined}>
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
