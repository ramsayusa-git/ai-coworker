import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PencilIcon, WalletIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, qty } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BillStatusBadge, isBillOverdue } from '../bill-status'
import { BillStatusActions } from './bill-actions'

export const metadata = { title: 'Bill' }

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const bill = await db.bill.findUnique({
    where: { id },
    include: {
      vendor: true,
      po: { select: { id: true, poNumber: true } },
      billLines: { orderBy: { lineOrder: 'asc' }, include: { item: true, account: true } },
      billPaymentAllocations: { include: { billPayment: true } },
      vendorCreditApplications: { include: { vendorCredit: true } },
    },
  })
  if (!bill) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const overdue = isBillOverdue(bill.dueDate, bill.balanceDue, bill.status)
  const taxRatePercent = Number(bill.taxRate.toString()) * 100

  const postings = await db.transaction.findMany({
    where: { sourceId: bill.id, sourceType: 'bill' },
    orderBy: { id: 'asc' },
    include: { transactionLines: { include: { account: true } } },
  })

  const settled =
    bill.billPaymentAllocations.length > 0 || bill.vendorCreditApplications.length > 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Bill ${bill.billNumber}`}
        description={`${bill.vendor.name} · ${bill.date.toISOString().slice(0, 10)}`}
        actions={
          bill.status === 'VOID' ? null : (
            <>
              <BillStatusActions
                id={bill.id}
                hasPayments={money(bill.amountPaid.toString()).greaterThan(0)}
              />
              <Button asChild variant="outline" size="sm">
                <Link href={`/bills/${bill.id}/edit`}><PencilIcon /> Edit</Link>
              </Button>
              {money(bill.balanceDue.toString()).greaterThan(0) && (
                <Button asChild size="sm">
                  <Link href={`/bill-payments/new?vendor=${bill.vendorId}&bill=${bill.id}`}>
                    <WalletIcon /> Pay this bill
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <BillStatusBadge status={bill.status} dueDate={bill.dueDate} balanceDue={bill.balanceDue.toString()} />
        {bill.dueDate && (
          <span className={`text-sm ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
            Due {bill.dueDate.toISOString().slice(0, 10)} · {bill.terms ?? 'Net 30'}
          </span>
        )}
        {bill.refNumber && <Badge variant="muted">Ref {bill.refNumber}</Badge>}
        {bill.po && (
          <Badge variant="outline">
            <Link href={`/purchase-orders/${bill.po.id}`}>From {bill.po.poNumber}</Link>
          </Badge>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead numeric>Qty</TableHead>
                    <TableHead numeric>Cost</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.billLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        {line.item ? (
                          <Link href={`/items/${line.item.id}`} className="underline-offset-4 hover:underline">
                            {line.item.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.account ? (
                          <>
                            <span className="mr-1 text-xs">{line.account.accountNumber}</span>
                            {line.account.name}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="max-w-72 truncate">{line.description ?? '—'}</TableCell>
                      <TableCell numeric>{qty(line.quantity.toString()).toFixed(2)}</TableCell>
                      <TableCell numeric>{formatMoney(line.rate.toString(), currency)}</TableCell>
                      <TableCell numeric>{formatMoney(line.amount.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {settled && (
            <Card>
              <CardHeader><CardTitle>Applied against this bill</CardTitle></CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead numeric>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bill.billPaymentAllocations.map((allocation) => (
                      <TableRow key={`p-${allocation.id}`}>
                        <TableCell>
                          <Badge variant={allocation.billPayment.isVoided ? 'outline' : 'muted'}>
                            {allocation.billPayment.isVoided ? 'Payment (voided)' : 'Payment'}
                          </Badge>
                        </TableCell>
                        <TableCell>{allocation.billPayment.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell>
                          <Link
                            href={`/bill-payments/${allocation.billPayment.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {allocation.billPayment.checkNumber ??
                              allocation.billPayment.method ??
                              'Payment'}
                          </Link>
                        </TableCell>
                        <TableCell numeric>{formatMoney(allocation.amount.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                    {bill.vendorCreditApplications.map((application) => (
                      <TableRow key={`c-${application.id}`}>
                        <TableCell><Badge variant="muted">Vendor credit</Badge></TableCell>
                        <TableCell>{application.vendorCredit.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell>
                          <Link
                            href={`/vendor-credits/${application.vendorCredit.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {application.vendorCredit.creditNumber}
                          </Link>
                        </TableCell>
                        <TableCell numeric>{formatMoney(application.amount.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>What this posted</CardTitle></CardHeader>
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
              <Row label="Subtotal" value={formatMoney(bill.subtotal.toString(), currency)} />
              {taxRatePercent > 0 && (
                <Row
                  label={`Tax (${taxRatePercent.toFixed(2)}%)`}
                  value={formatMoney(bill.taxAmount.toString(), currency)}
                />
              )}
              <Separator />
              <Row label="Total" value={formatMoney(bill.total.toString(), currency)} strong />
              <Row label="Settled" value={formatMoney(bill.amountPaid.toString(), currency)} muted />
              <Row label="Balance due" value={formatMoney(bill.balanceDue.toString(), currency)} strong />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vendor</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link
                href={`/vendors/${bill.vendorId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {bill.vendor.name}
              </Link>
              {bill.vendor.email && <p className="text-muted-foreground">{bill.vendor.email}</p>}
              {bill.vendor.phone && <p className="text-muted-foreground">{bill.vendor.phone}</p>}
            </CardContent>
          </Card>

          {bill.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{bill.notes}</CardContent>
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
