import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { cents, formatMoney, money, sum } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DocumentStatus } from '@/components/app/document-status'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PaymentVoidAction } from './payment-actions'

export const metadata = { title: 'Payment' }

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      customer: true,
      depositToAccount: { select: { id: true, name: true, accountNumber: true } },
      paymentAllocations: {
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              date: true,
              status: true,
              total: true,
              balanceDue: true,
            },
          },
        },
      },
    },
  })
  if (!payment) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const amount = money(payment.amount.toString())
  const applied = cents(sum(payment.paymentAllocations.map((a) => money(a.amount.toString()))))
  const unapplied = cents(amount.minus(applied))

  const postings = await db.transaction.findMany({
    where: { sourceId: payment.id, sourceType: 'payment' },
    orderBy: { id: 'asc' },
    include: { transactionLines: { include: { account: true } } },
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Payment ${formatMoney(amount, currency)}`}
        description={`${payment.customer.name} · ${payment.date.toISOString().slice(0, 10)}`}
        actions={<PaymentVoidAction id={payment.id} isVoided={payment.isVoided} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        {payment.isVoided ? (
          <Badge variant="destructive">Void</Badge>
        ) : (
          <Badge variant="success">Recorded</Badge>
        )}
        {payment.method && <Badge variant="muted">{payment.method}</Badge>}
        {payment.checkNumber && (
          <span className="text-muted-foreground text-sm">Check {payment.checkNumber}</span>
        )}
        {payment.reference && (
          <span className="text-muted-foreground text-sm">Ref {payment.reference}</span>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Applied to</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {payment.paymentAllocations.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  Nothing was matched to an invoice. The whole amount sits as a credit on this
                  customer — apply it from an invoice when the right one arrives.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead numeric>Invoice total</TableHead>
                      <TableHead numeric>Still open</TableHead>
                      <TableHead numeric>Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payment.paymentAllocations.map((allocation) => (
                      <TableRow key={allocation.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/invoices/${allocation.invoice.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {allocation.invoice.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{allocation.invoice.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell>
                          <DocumentStatus kind="invoice" status={allocation.invoice.status} />
                        </TableCell>
                        <TableCell numeric>
                          {formatMoney(allocation.invoice.total.toString(), currency)}
                        </TableCell>
                        <TableCell numeric>
                          {formatMoney(allocation.invoice.balanceDue.toString(), currency)}
                        </TableCell>
                        <TableCell numeric>
                          {formatMoney(allocation.amount.toString(), currency)}
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
              <Row label="Received" value={formatMoney(amount, currency)} strong />
              <Row label="Applied" value={formatMoney(applied, currency)} />
              <Separator />
              <Row label="Unapplied credit" value={formatMoney(unapplied, currency)} strong />
              <p className="text-muted-foreground pt-1 text-xs">
                Deposited to{' '}
                {payment.depositToAccount
                  ? `${payment.depositToAccount.accountNumber ?? ''} ${payment.depositToAccount.name}`.trim()
                  : 'undeposited funds'}
                .
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>From</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link
                href={`/customers/${payment.customerId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {payment.customer.name}
              </Link>
              {payment.customer.email && (
                <p className="text-muted-foreground">{payment.customer.email}</p>
              )}
            </CardContent>
          </Card>

          {payment.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{payment.notes}</CardContent>
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
