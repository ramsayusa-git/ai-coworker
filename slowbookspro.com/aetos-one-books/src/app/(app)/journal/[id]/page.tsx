import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ReverseButton } from '../reverse-button'

export const metadata = { title: 'Journal entry' }

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entryId = Number(id)
  if (!Number.isInteger(entryId) || entryId <= 0) notFound()

  const { db, settings } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'

  const entry = await db.transaction.findUnique({
    where: { id: entryId },
    include: {
      transactionLines: { include: { account: true }, orderBy: { id: 'asc' } },
      reversal: true,
      reversalOf: true,
    },
  })
  if (!entry) notFound()

  const debit = sum(entry.transactionLines.map((l) => money(l.debit.toString())))
  const credit = sum(entry.transactionLines.map((l) => money(l.credit.toString())))
  const reconciled = entry.transactionLines.some((l) => l.reconciliationId !== null)

  const blockedReason = entry.isVoided
    ? 'This entry has already been reversed.'
    : entry.reversalOf
      ? 'A reversal cannot itself be reversed.'
      : reconciled
        ? 'A line here is in a completed reconciliation.'
        : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={entry.description || `Entry #${entry.id}`}
        description={`${entry.date.toISOString().slice(0, 10)} · ${entry.sourceType ?? 'journal'}${entry.reference ? ` · ${entry.reference}` : ''}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/journal">
                <ArrowLeftIcon /> Journal
              </Link>
            </Button>
            <ReverseButton
              transactionId={entry.id}
              description={entry.description || `Entry #${entry.id}`}
              disabled={Boolean(blockedReason)}
              reason={blockedReason}
            />
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {entry.isVoided && <Badge variant="destructive">Reversed</Badge>}
        {entry.reversalOf && (
          <Badge variant="muted">
            Reversal of entry #{entry.reversalOf.id}
          </Badge>
        )}
        {entry.reversal && (
          <Badge variant="muted">
            <Link href={`/journal/${entry.reversal.id}`}>Reversed by entry #{entry.reversal.id}</Link>
          </Badge>
        )}
        {reconciled && <Badge variant="success">In a completed reconciliation</Badge>}
      </div>

      {blockedReason && (
        <Card>
          <CardContent className="text-muted-foreground py-4 text-sm">{blockedReason}</CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="hidden sm:table-cell">Memo</TableHead>
              <TableHead className="w-24">Cleared</TableHead>
              <TableHead numeric>Debit</TableHead>
              <TableHead numeric>Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.transactionLines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  {line.account.accountNumber ? `${line.account.accountNumber} · ` : ''}
                  {line.account.name}
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {line.description || '—'}
                </TableCell>
                <TableCell>
                  {line.reconciliationId ? (
                    <Badge variant="success">Reconciled</Badge>
                  ) : line.cleared ? (
                    <Badge variant="muted">Cleared</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell numeric>
                  {money(line.debit.toString()).isZero()
                    ? '—'
                    : formatMoney(line.debit.toString(), currency)}
                </TableCell>
                <TableCell numeric>
                  {money(line.credit.toString()).isZero()
                    ? '—'
                    : formatMoney(line.credit.toString(), currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Totals</TableCell>
              <TableCell numeric>{formatMoney(debit, currency)}</TableCell>
              <TableCell numeric>{formatMoney(credit, currency)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}
