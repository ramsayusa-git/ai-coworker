import Link from 'next/link'
import { LandmarkIcon, UploadIcon, WrenchIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney } from '@/lib/money'
import { accountOptions } from '@/server/accounts'
import { accountRegister, bankingOverview, reviewQueue } from '@/server/banking'
import { PageHeader, EmptyState } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { AccountCards } from './account-cards'
import { Register } from './register'
import { ReviewQueue, type ReviewRow } from './review-queue'
import { FeedDialog } from './feed-dialog'

export const metadata = { title: 'Bank & cards' }

const STATUSES = ['UNMATCHED', 'AUTO', 'MANUAL', 'ADDED', 'EXCLUDED'] as const
type Status = (typeof STATUSES)[number]

export default async function BankingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const single = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const { db, settings } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'

  const overview = await bankingOverview(db)
  const requested = Number(single('account') ?? 0)
  const selected = overview.find((row) => row.accountId === requested) ?? overview[0] ?? null

  const view = single('view') === 'review' ? 'review' : 'register'
  const status = (STATUSES as readonly string[]).includes(single('status') ?? '')
    ? (single('status') as Status)
    : 'UNMATCHED'

  const [categories, bankAccounts] = await Promise.all([
    accountOptions(db),
    accountOptions(db, { bankOnly: true }),
  ])

  if (!selected) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title="Bank & cards"
          description="The bank register is the general ledger — a bank account is a chart-of-accounts row with its kind set."
        />
        <EmptyState
          title="No bank or credit-card accounts yet"
          description="Set an account's kind to bank or credit card under Chart of accounts, and it appears here with a register, a feed and reconciliation."
          icon={LandmarkIcon}
          action={
            <Button asChild size="sm">
              <Link href="/accounts">Open chart of accounts</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const register =
    view === 'register'
      ? await accountRegister(db, selected.accountId)
      : null

  const queue =
    view === 'review' && selected.feed
      ? await reviewQueue(db, selected.feed.id, status, { take: 100 })
      : null

  const reviewRows: ReviewRow[] =
    queue?.lines.map((line) => ({
      id: line.id,
      date: line.date.toISOString().slice(0, 10),
      amountRaw: line.amount.toString(),
      amount: formatMoney(line.amount.toString(), currency),
      isDeposit: Number(line.amount) > 0,
      payee: line.payee ?? '',
      description: line.description ?? '',
      checkNumber: line.checkNumber ?? '',
      categoryAccountId: line.categoryAccountId,
      categoryName: line.categoryAccount?.name ?? null,
      matchStatus: line.matchStatus ?? 'UNMATCHED',
      importSource: line.importSource ?? '',
      suggestion: line.suggestion
        ? {
            lineId: line.suggestion.lineId,
            transactionId: line.suggestion.transactionId,
            date: line.suggestion.date.toISOString().slice(0, 10),
            daysOff: line.suggestion.daysOff,
            description: line.suggestion.description,
            reference: line.suggestion.reference,
          }
        : null,
    })) ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Bank & cards"
        description="Balances are derived from the ledger. Imported lines wait in the review queue until someone accepts them."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/banking/rules">
                <WrenchIcon /> Rules
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/banking/import">
                <UploadIcon /> Import statement
              </Link>
            </Button>
          </>
        }
      />

      <AccountCards
        rows={overview.map((row) => ({
          accountId: row.accountId,
          accountNumber: row.accountNumber,
          name: row.name,
          bankKind: row.bankKind,
          balance: formatMoney(row.balance, currency),
          toReview: row.toReview,
          lastReconciled: row.lastReconciled ? row.lastReconciled.toISOString().slice(0, 10) : null,
          hasFeed: row.feed !== null,
        }))}
        selectedId={selected.accountId}
        view={view}
      />

      {!selected.feed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {selected.name} has no statement feed yet, so there is nothing to review. Add one to
            import OFX, QFX or CSV statements against it.
          </span>
          <FeedDialog accountId={selected.accountId} accountName={selected.name} />
        </div>
      )}

      {view === 'register' && register && (
        <Register
          accountId={selected.accountId}
          accountName={selected.name}
          bankKind={selected.bankKind}
          currency={currency}
          naturalBalance={register.naturalBalance}
          openingBalance={formatMoney(register.openingBalance, currency)}
          balance={formatMoney(register.balance, currency)}
          categories={categories}
          entries={register.entries.map((entry) => ({
            lineId: entry.lineId,
            transactionId: entry.transactionId,
            date: entry.date.toISOString().slice(0, 10),
            description: entry.description,
            payee: entry.payee,
            reference: entry.reference,
            payment: entry.amount.isNegative() ? formatMoney(entry.amount.negated(), currency) : '',
            deposit: entry.amount.isPositive() ? formatMoney(entry.amount, currency) : '',
            balance: formatMoney(entry.runningBalance, currency),
            sourceType: entry.sourceType,
            cleared: entry.cleared,
            reconciled: entry.reconciliationId !== null,
            voided: entry.voided,
            voidable: entry.voidable,
          }))}
        />
      )}

      {view === 'review' && selected.feed && queue && (
        <ReviewQueue
          bankAccountId={selected.feed.id}
          feedName={selected.feed.name}
          status={status}
          total={queue.total}
          rows={reviewRows}
          categories={categories}
          bankAccounts={bankAccounts}
        />
      )}
    </div>
  )
}
