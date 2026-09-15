import Link from 'next/link'
import { notFound } from 'next/navigation'
import { HandCoinsIcon, PencilIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { formatMoney, money, qty } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DocumentStatus, isOverdue } from '@/components/app/document-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { InvoiceStatusActions } from './invoice-actions'

export const metadata = { title: 'Invoice' }

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings, features } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      invoiceLines: { orderBy: { lineOrder: 'asc' }, include: { item: true } },
      paymentAllocations: { include: { payment: true } },
      creditApplications: { include: { creditMemo: true } },
    },
  })
  if (!invoice) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const label = features.nonprofit ? 'Pledge' : 'Invoice'
  const overdue = isOverdue(invoice.dueDate, invoice.balanceDue, invoice.status)
  const taxRatePercent = Number(invoice.taxRate.toString()) * 100

  const postings = await db.transaction.findMany({
    where: { sourceId: invoice.id, sourceType: { in: ['invoice', 'invoice_cogs'] } },
    orderBy: { id: 'asc' },
    include: { transactionLines: { include: { account: true } } },
  })

  const billTo = [
    invoice.customer.name,
    invoice.billAddress1 ?? invoice.customer.billAddress1,
    invoice.billAddress2 ?? invoice.customer.billAddress2,
    [
      invoice.billCity ?? invoice.customer.billCity,
      invoice.billState ?? invoice.customer.billState,
      invoice.billZip ?? invoice.customer.billZip,
    ]
      .filter(Boolean)
      .join(' '),
  ].filter((part) => part && String(part).trim() !== '')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`${label} ${invoice.invoiceNumber}`}
        description={`${invoice.customer.name} · ${invoice.date.toISOString().slice(0, 10)}`}
        actions={
          <>
            <InvoiceStatusActions
              id={invoice.id}
              status={invoice.status}
              hasPayments={money(invoice.amountPaid.toString()).isPositive()}
              balanceDue={invoice.balanceDue.toString()}
              today={toDateInput(startOfToday())}
              label={label}
            />
            {invoice.status !== 'VOID' && (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/invoices/${invoice.id}/edit`}><PencilIcon /> Edit</Link>
                </Button>
                {money(invoice.balanceDue.toString()).isPositive() && (
                  <Button asChild size="sm">
                    <Link href={`/payments/new?customer=${invoice.customerId}&invoice=${invoice.id}`}>
                      <HandCoinsIcon /> Receive payment
                    </Link>
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <DocumentStatus kind="invoice" status={invoice.status} overdue={overdue} />
        {invoice.dueDate && (
          <span className="text-muted-foreground text-sm">
            Due {invoice.dueDate.toISOString().slice(0, 10)} · {invoice.terms ?? 'Net 30'}
          </span>
        )}
        {invoice.poNumber && <Badge variant="muted">PO {invoice.poNumber}</Badge>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead numeric>Qty</TableHead>
                    <TableHead numeric>Rate</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.invoiceLines.map((line) => (
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
                      <TableCell className="max-w-80 truncate">{line.description ?? '—'}</TableCell>
                      <TableCell numeric>{qty(line.quantity.toString()).toFixed(2)}</TableCell>
                      <TableCell numeric>{formatMoney(line.rate.toString(), currency)}</TableCell>
                      <TableCell>
                        {line.isTaxable ? (
                          <Badge variant="muted">Taxed</Badge>
                        ) : (
                          <Badge variant="outline">Exempt</Badge>
                        )}
                      </TableCell>
                      <TableCell numeric>{formatMoney(line.amount.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(invoice.paymentAllocations.length > 0 || invoice.creditApplications.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Applied against this {label.toLowerCase()}</CardTitle>
              </CardHeader>
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
                    {invoice.paymentAllocations.map((allocation) => (
                      <TableRow key={`p-${allocation.id}`}>
                        <TableCell>
                          <Badge variant={allocation.payment.isVoided ? 'outline' : 'muted'}>
                            {allocation.payment.isVoided ? 'Payment (voided)' : 'Payment'}
                          </Badge>
                        </TableCell>
                        <TableCell>{allocation.payment.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell>
                          <Link
                            href={`/payments/${allocation.payment.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {allocation.payment.reference ??
                              allocation.payment.checkNumber ??
                              allocation.payment.method ??
                              'Payment'}
                          </Link>
                        </TableCell>
                        <TableCell numeric>{formatMoney(allocation.amount.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                    {invoice.creditApplications.map((application) => (
                      <TableRow key={`c-${application.id}`}>
                        <TableCell><Badge variant="muted">Credit memo</Badge></TableCell>
                        <TableCell>{application.creditMemo.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell>
                          <Link
                            href={`/credit-memos/${application.creditMemo.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {application.creditMemo.memoNumber}
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
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(invoice.subtotal.toString(), currency)} />
              {taxRatePercent > 0 && (
                <Row
                  label={`Sales tax (${taxRatePercent.toFixed(2)}%)`}
                  value={formatMoney(invoice.taxAmount.toString(), currency)}
                />
              )}
              <Separator />
              <Row label="Total" value={formatMoney(invoice.total.toString(), currency)} strong />
              <Row label="Paid" value={formatMoney(invoice.amountPaid.toString(), currency)} muted />
              <Row
                label="Balance due"
                value={formatMoney(invoice.balanceDue.toString(), currency)}
                strong
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bill to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link
                href={`/customers/${invoice.customerId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {invoice.customer.name}
              </Link>
              {billTo.slice(1).map((part, index) => (
                <p key={index} className="text-muted-foreground">{part}</p>
              ))}
              {invoice.customer.email && (
                <p className="text-muted-foreground">{invoice.customer.email}</p>
              )}
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{invoice.notes}</CardContent>
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
