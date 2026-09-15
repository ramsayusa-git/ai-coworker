import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { formatMoney, money } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ExpenseActions } from './expense-actions'

export const metadata = { title: 'Expense' }

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const entry = await db.transaction.findUnique({
    where: { id },
    include: { transactionLines: { include: { account: true } } },
  })
  if (!entry || (entry.sourceType !== 'expense' && entry.sourceType !== 'cc_charge')) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const kind = entry.sourceType === 'cc_charge' ? ('card' as const) : ('expense' as const)
  const debit = entry.transactionLines.find((line) => !money(line.debit.toString()).isZero())
  const credit = entry.transactionLines.find((line) => !money(line.credit.toString()).isZero())
  const payee = (entry.description ?? '').replace(/^(Expense|Card charge):\s*/, '').trim()

  // The vendor, when there is one, is carried on the entry's source id.
  const vendor = entry.sourceId
    ? await db.vendor.findUnique({ where: { id: entry.sourceId }, select: { id: true, name: true } })
    : null

  const reversal = entry.reversalId
    ? await db.transaction.findUnique({ where: { id: entry.reversalId }, select: { id: true, date: true } })
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={kind === 'card' ? 'Credit-card charge' : 'Expense'}
        description={`${entry.date.toISOString().slice(0, 10)} · ${formatMoney(debit?.debit.toString() ?? 0, currency)}`}
        actions={entry.isVoided ? null : <ExpenseActions id={entry.id} kind={kind} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        {entry.isVoided ? (
          <Badge variant="destructive">Void</Badge>
        ) : (
          <Badge variant="success">Posted</Badge>
        )}
        <Badge variant="outline">{kind === 'card' ? 'Card charge' : 'Expense'}</Badge>
        {entry.reference && <Badge variant="muted">Ref {entry.reference}</Badge>}
      </div>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row
            label="Payee"
            value={
              vendor ? (
                <Link
                  href={`/vendors/${vendor.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {vendor.name}
                </Link>
              ) : (
                payee || '—'
              )
            }
          />
          <Row label="Spent on" value={debit?.account.name ?? '—'} />
          <Row label={kind === 'card' ? 'Card' : 'Paid from'} value={credit?.account.name ?? '—'} />
          <Row label="Memo" value={debit?.description ?? '—'} />
          {reversal && (
            <Row
              label="Reversed by"
              value={`Entry ${reversal.id} on ${reversal.date.toISOString().slice(0, 10)}`}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What this posted</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead numeric>Debit</TableHead>
                <TableHead numeric>Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.transactionLines.map((line) => (
                <TableRow key={line.id} className={entry.isVoided ? 'opacity-60' : undefined}>
                  <TableCell>
                    <span className="text-muted-foreground mr-2 text-xs">
                      {line.account.accountNumber}
                    </span>
                    {line.account.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{line.description ?? '—'}</TableCell>
                  <TableCell numeric>
                    {money(line.debit.toString()).isZero()
                      ? ''
                      : formatMoney(line.debit.toString(), currency)}
                  </TableCell>
                  <TableCell numeric>
                    {money(line.credit.toString()).isZero()
                      ? ''
                      : formatMoney(line.credit.toString(), currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}
