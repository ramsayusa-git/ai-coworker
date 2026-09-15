import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { formatMoney, money, qty } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DocumentStatus } from '@/components/app/document-status'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CreditMemoActions } from './credit-memo-actions'

export const metadata = { title: 'Credit memo' }

export default async function CreditMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const memo = await db.creditMemo.findUnique({
    where: { id },
    include: {
      customer: true,
      creditMemoLines: { orderBy: { lineOrder: 'asc' }, include: { item: true } },
      originalInvoice: { select: { id: true, invoiceNumber: true } },
      creditApplications: {
        include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } },
      },
    },
  })
  if (!memo) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxRatePercent = Number(memo.taxRate.toString()) * 100

  const postings = await db.transaction.findMany({
    where: { sourceId: memo.id, sourceType: { in: ['credit_memo', 'credit_memo_cogs'] } },
    orderBy: { id: 'asc' },
    include: { transactionLines: { include: { account: true } } },
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Credit memo ${memo.memoNumber}`}
        description={`${memo.customer.name} · ${memo.date.toISOString().slice(0, 10)}`}
        actions={
          <CreditMemoActions
            id={memo.id}
            customerId={memo.customerId}
            status={memo.status}
            balanceRemaining={memo.balanceRemaining.toString()}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <DocumentStatus kind="creditMemo" status={memo.status} />
        {memo.isWriteOff && <Badge variant="warning">Bad debt write-off</Badge>}
        {memo.originalInvoice && (
          <Link
            href={`/invoices/${memo.originalInvoice.id}`}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Against invoice {memo.originalInvoice.invoiceNumber}
          </Link>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Credited</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead numeric>Qty</TableHead>
                    <TableHead numeric>Rate</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memo.creditMemoLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        {line.item ? (
                          <Link
                            href={`/items/${line.item.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {line.item.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="max-w-80 truncate">{line.description ?? '—'}</TableCell>
                      <TableCell numeric>{qty(line.quantity.toString()).toFixed(2)}</TableCell>
                      <TableCell numeric>{formatMoney(line.rate.toString(), currency)}</TableCell>
                      <TableCell numeric>{formatMoney(line.amount.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Applied to</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {memo.creditApplications.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  Not applied to anything yet. The whole credit is available against this customer’s
                  open invoices.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied on</TableHead>
                      <TableHead numeric>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memo.creditApplications.map((application) => (
                      <TableRow key={application.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/invoices/${application.invoice.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {application.invoice.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <DocumentStatus kind="invoice" status={application.invoice.status} />
                        </TableCell>
                        <TableCell>{application.createdAt.toISOString().slice(0, 10)}</TableCell>
                        <TableCell numeric>
                          {formatMoney(application.amount.toString(), currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What this posted</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {postings.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">Nothing posted yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead numeric>Debit</TableHead>
                      <TableHead numeric>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postings.flatMap((posting) =>
                      posting.transactionLines.map((line) => (
                        <TableRow
                          key={line.id}
                          className={posting.isVoided ? 'opacity-60' : undefined}
                        >
                          <TableCell>
                            <span className="text-muted-foreground mr-2 text-xs">
                              {line.account.accountNumber}
                            </span>
                            {line.account.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {posting.isVoided
                              ? 'Reversed'
                              : (posting.description ?? posting.sourceType)}
                          </TableCell>
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
                      )),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(memo.subtotal.toString(), currency)} />
              {taxRatePercent > 0 && (
                <Row
                  label={`Sales tax (${taxRatePercent.toFixed(2)}%)`}
                  value={formatMoney(memo.taxAmount.toString(), currency)}
                />
              )}
              <Separator />
              <Row label="Credit total" value={formatMoney(memo.total.toString(), currency)} strong />
              <Row label="Applied" value={formatMoney(memo.amountApplied.toString(), currency)} />
              <Row
                label="Still unapplied"
                value={formatMoney(memo.balanceRemaining.toString(), currency)}
                strong
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Credited to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link
                href={`/customers/${memo.customerId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {memo.customer.name}
              </Link>
              {memo.customer.email && (
                <p className="text-muted-foreground">{memo.customer.email}</p>
              )}
            </CardContent>
          </Card>

          {memo.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Reason</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{memo.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
