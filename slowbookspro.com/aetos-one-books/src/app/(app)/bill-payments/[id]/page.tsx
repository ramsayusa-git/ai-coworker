import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BillPaymentActions } from './payment-actions'

export const metadata = { title: 'Bill payment' }

export default async function BillPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const payment = await db.billPayment.findUnique({
    where: { id },
    include: {
      vendor: true,
      payFromAccount: { select: { name: true, accountNumber: true } },
      billPaymentAllocations: { include: { bill: true } },
    },
  })
  if (!payment) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const applied = sum(
    payment.billPaymentAllocations.map((allocation) => money(allocation.amount.toString())),
  )
  const unapplied = money(payment.amount.toString()).minus(applied)

  const postings = await db.transaction.findMany({
    where: { sourceId: payment.id, sourceType: 'bill_payment' },
    orderBy: { id: 'asc' },
    include: { transactionLines: { include: { account: true } } },
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Payment to ${payment.vendor.name}`}
        description={`${payment.date.toISOString().slice(0, 10)} · ${formatMoney(payment.amount.toString(), currency)}`}
        actions={payment.isVoided ? null : <BillPaymentActions id={payment.id} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        {payment.isVoided ? (
          <Badge variant="destructive">Void</Badge>
        ) : (
          <Badge variant="success">Posted</Badge>
        )}
        {payment.method && <Badge variant="muted">{payment.method}</Badge>}
        {payment.checkNumber && <Badge variant="outline">Check {payment.checkNumber}</Badge>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Bills settled</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {payment.billPaymentAllocations.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  Nothing was allocated — this payment sits against the vendor as a prepayment.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead numeric>Bill total</TableHead>
                      <TableHead numeric>Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payment.billPaymentAllocations.map((allocation) => (
                      <TableRow key={allocation.id}>
                        <TableCell className="font-medium">
                          <Link href={`/bills/${allocation.bill.id}`} className="underline-offset-4 hover:underline">
                            {allocation.bill.billNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{allocation.bill.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell numeric>{formatMoney(allocation.bill.total.toString(), currency)}</TableCell>
                        <TableCell numeric>{formatMoney(allocation.amount.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>What this posted</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {postings.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">Nothing posted.</p>
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
                        <TableRow key={line.id} className={posting.isVoided ? 'opacity-60' : undefined}>
                          <TableCell>
                            <span className="text-muted-foreground mr-2 text-xs">
                              {line.account.accountNumber}
                            </span>
                            {line.account.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {posting.isVoided ? 'Reversed' : (posting.description ?? posting.sourceType)}
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
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Payment" value={formatMoney(payment.amount.toString(), currency)} strong />
              <Row label="Applied to bills" value={formatMoney(applied, currency)} />
              {unapplied.greaterThan(0) && (
                <Row label="Prepayment" value={formatMoney(unapplied, currency)} muted />
              )}
              <Separator />
              <Row
                label="Paid from"
                value={
                  payment.payFromAccount
                    ? `${payment.payFromAccount.accountNumber ?? ''} ${payment.payFromAccount.name}`.trim()
                    : '—'
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vendor</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <Link
                href={`/vendors/${payment.vendorId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {payment.vendor.name}
              </Link>
            </CardContent>
          </Card>

          {payment.notes && (
            <Card>
              <CardHeader><CardTitle>Memo</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{payment.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
