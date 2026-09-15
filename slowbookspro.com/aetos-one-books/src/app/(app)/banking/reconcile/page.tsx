import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money } from '@/lib/money'
import { accountOptions } from '@/server/accounts'
import { listReconciliations, reconciliationSession } from '@/server/reconcile'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ReconcileSession, type SessionLine } from './reconcile-session'
import { StartForm } from './start-form'

export const metadata = { title: 'Reconcile' }

export default async function ReconcilePage({
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

  const requestedAccount = Number(single('account') ?? 0) || null
  const requestedSession = Number(single('session') ?? 0) || null

  const [bankAccounts, history] = await Promise.all([
    accountOptions(db, { bankOnly: true }),
    listReconciliations(db),
  ])

  // An open session on the chosen account takes precedence over the history
  // list: it is the thing the person came here to finish.
  const open = history.find(
    (row) =>
      row.status === 'IN_PROGRESS' &&
      (requestedAccount ? row.accountId === requestedAccount : true),
  )
  const activeId = requestedSession ?? open?.id ?? null

  const session = activeId ? await reconciliationSession(db, activeId).catch(() => null) : null

  const previousBalances: Record<number, string> = {}
  for (const row of history) {
    if (row.status === 'COMPLETED' && row.accountId && !(row.accountId in previousBalances)) {
      previousBalances[row.accountId] = formatMoney(row.statementBalance.toString(), currency)
    }
  }

  const lines: SessionLine[] =
    session?.lines.map((line) => ({
      lineId: line.lineId,
      transactionId: line.transactionId,
      date: line.date.toISOString().slice(0, 10),
      description: line.description,
      reference: line.reference,
      amount: formatMoney(line.amount, currency),
      isPositive: line.amount.isPositive(),
      cleared: line.cleared,
      matched: line.matched,
      sourceType: line.sourceType,
    })) ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Reconcile"
        description="Tick what the statement shows. Finishing stamps those lines, which is what stops a closed month being quietly reversed."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/banking">
              <ArrowLeftIcon /> Back to banking
            </Link>
          </Button>
        }
      />

      {session ? (
        <ReconcileSession
          reconciliationId={session.reconciliation.id}
          accountName={session.account.name}
          statementDate={session.statementDate.toISOString().slice(0, 10)}
          statementBalance={formatMoney(session.statementBalance, currency)}
          beginningBalance={formatMoney(session.beginningBalance, currency)}
          clearedTotal={formatMoney(session.clearedTotal, currency)}
          unclearedTotal={formatMoney(session.unclearedTotal, currency)}
          difference={formatMoney(session.difference, currency)}
          isBalanced={session.difference.abs().lessThanOrEqualTo('0.005')}
          clearedCount={session.clearedCount}
          completed={session.reconciliation.status === 'COMPLETED'}
          lines={lines}
        />
      ) : (
        <StartForm
          accounts={bankAccounts}
          defaultAccountId={requestedAccount}
          previousBalances={previousBalances}
        />
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation history</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statement date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Beginning</TableHead>
                  <TableHead numeric>Statement</TableHead>
                  <TableHead numeric>Cleared</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {row.statementDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>{row.account?.name ?? '—'}</TableCell>
                    <TableCell>
                      {row.status === 'COMPLETED' ? (
                        <Badge variant="success">Finished</Badge>
                      ) : (
                        <Badge variant="warning">In progress</Badge>
                      )}
                    </TableCell>
                    <TableCell numeric>
                      {formatMoney(row.beginningBalance.toString(), currency)}
                    </TableCell>
                    <TableCell numeric>
                      {formatMoney(row.statementBalance.toString(), currency)}
                    </TableCell>
                    <TableCell numeric>
                      {row.clearedTotal
                        ? formatMoney(money(row.clearedTotal.toString()), currency)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/banking/reconcile?session=${row.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
