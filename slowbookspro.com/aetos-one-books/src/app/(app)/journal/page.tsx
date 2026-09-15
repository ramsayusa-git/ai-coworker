import Link from 'next/link'
import { BookOpenIcon, PlusIcon } from 'lucide-react'
import type { Prisma } from '@/generated/tenant/client'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {  } from '@/components/app/data-table'
import { listParams } from '@/lib/list-params'
import { JournalTable, type JournalRow } from './journal-table'

export const metadata = { title: 'Journal entries' }

const SORTS: Record<string, Prisma.TransactionOrderByWithRelationInput[]> = {
  date: [{ date: 'asc' }, { id: 'asc' }],
  id: [{ id: 'asc' }],
  source: [{ sourceType: 'asc' }, { id: 'asc' }],
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'date', dir: 'desc' })
  const source = typeof params.source === 'string' ? params.source : 'manual'

  const { db, settings } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'

  const where: Prisma.TransactionWhereInput = {
    ...(source === 'all' ? {} : { sourceType: source }),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: 'insensitive' } },
            { reference: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const orderBy = (SORTS[sort] ?? SORTS.date!).map((clause) =>
    Object.fromEntries(Object.entries(clause).map(([key]) => [key, dir])),
  ) as Prisma.TransactionOrderByWithRelationInput[]

  const [entries, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { transactionLines: { include: { account: true } }, reversalOf: true },
    }),
    db.transaction.count({ where }),
  ])

  const rows: JournalRow[] = entries.map((entry) => ({
    id: entry.id,
    date: entry.date.toISOString().slice(0, 10),
    description: entry.description ?? '',
    reference: entry.reference ?? '',
    sourceType: entry.sourceType ?? 'journal',
    amount: formatMoney(
      sum(entry.transactionLines.map((line) => money(line.debit.toString()))),
      currency,
    ),
    accounts: entry.transactionLines.map((line) => line.account.name),
    lineCount: entry.transactionLines.length,
    isVoided: entry.isVoided,
    isReversal: entry.reversalOf !== null,
    reconciled: entry.transactionLines.some((line) => line.reconciliationId !== null),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Journal entries"
        description="Manual entries by default. Switch the filter to see everything the ledger holds."
        actions={
          <Button asChild size="sm">
            <Link href="/journal/new">
              <PlusIcon /> New entry
            </Link>
          </Button>
        }
      />

      <JournalTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        source={source}
        empty={
          <EmptyState
            title={q ? 'No entry matches that' : 'No journal entries yet'}
            description={
              q
                ? 'Try a different description or reference.'
                : 'Documents post their own entries. A manual entry is for the corrections and accruals that have no document.'
            }
            icon={BookOpenIcon}
            action={
              !q ? (
                <Button asChild size="sm">
                  <Link href="/journal/new">New entry</Link>
                </Button>
              ) : undefined
            }
          />
        }
      />

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Badge variant="muted">Append-only</Badge>
        A posted entry is never edited or deleted — it is corrected by a reversal, so the trail
        stays intact.
      </p>
    </div>
  )
}
