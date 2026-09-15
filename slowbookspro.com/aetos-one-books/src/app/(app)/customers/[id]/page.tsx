import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileTextIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DocumentStatus, isOverdue } from '@/components/app/document-status'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CustomerActiveToggle } from './customer-actions'

export const metadata = { title: 'Customer' }

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings, features } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const noun = features.nonprofit ? 'donor' : 'customer'

  const [invoices, payments, credits] = await Promise.all([
    db.invoice.findMany({
      where: { customerId: id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 25,
    }),
    db.payment.findMany({
      where: { customerId: id, isVoided: false },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
    db.creditMemo.findMany({
      where: { customerId: id, status: 'ISSUED', balanceRemaining: { gt: 0 } },
      orderBy: { date: 'asc' },
    }),
  ])

  const openBalance = sum(
    invoices.filter((i) => i.status !== 'VOID').map((i) => money(i.balanceDue.toString())),
  )
  const overdue = sum(
    invoices
      .filter((i) => isOverdue(i.dueDate, i.balanceDue, i.status))
      .map((i) => money(i.balanceDue.toString())),
  )
  const unappliedCredit = sum(credits.map((c) => money(c.balanceRemaining.toString())))

  const address = [
    customer.billAddress1,
    customer.billAddress2,
    [customer.billCity, customer.billState].filter(Boolean).join(', '),
    customer.billZip,
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={customer.name}
        description={customer.companyName ?? customer.email ?? `A ${noun} on your books.`}
        actions={
          <>
            <CustomerActiveToggle id={customer.id} isActive={customer.isActive} noun={noun} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/customers/${customer.id}/edit`}><PencilIcon /> Edit</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/invoices/new?customer=${customer.id}`}><PlusIcon /> New invoice</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open balance" value={formatMoney(openBalance, currency)} />
        <Stat
          label="Overdue"
          value={formatMoney(overdue, currency)}
          tone={overdue.isPositive() ? 'negative' : undefined}
        />
        <Stat label="Unapplied credit" value={formatMoney(unappliedCredit, currency)} />
        <Stat label="Payment terms" value={customer.terms ?? 'Net 30'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Detail label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : null} />
            <Detail label="Phone" value={customer.phone} />
            <Detail label="Mobile" value={customer.mobile} />
            <Detail label="Website" value={customer.website} href={customer.website} />
            <Detail label="Billing address" value={address.length ? address.join('\n') : null} />
            <div className="flex items-center gap-2 pt-1">
              {customer.isTaxable ? (
                <Badge variant="muted">Sales tax charged</Badge>
              ) : (
                <Badge variant="outline">Tax exempt</Badge>
              )}
              {!customer.isActive && <Badge variant="outline">Inactive</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Invoices</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/invoices?customer=${customer.id}`}>See all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {invoices.length === 0 ? (
              <p className="text-muted-foreground px-5 pb-5 text-sm">
                Nothing invoiced yet.{' '}
                <Link className="text-primary underline-offset-4 hover:underline" href={`/invoices/new?customer=${customer.id}`}>
                  Create the first invoice
                </Link>
                .
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead numeric>Total</TableHead>
                    <TableHead numeric>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{invoice.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '—'}
                      </TableCell>
                      <TableCell>
                        <DocumentStatus
                          kind="invoice"
                          status={invoice.status}
                          overdue={isOverdue(invoice.dueDate, invoice.balanceDue, invoice.status)}
                        />
                      </TableCell>
                      <TableCell numeric>{formatMoney(invoice.total.toString(), currency)}</TableCell>
                      <TableCell numeric>{formatMoney(invoice.balanceDue.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent payments</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/payments/new?customer=${customer.id}`}>Receive payment</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {payments.length === 0 ? (
              <p className="text-muted-foreground px-5 pb-5 text-sm">No payments recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Link href={`/payments/${payment.id}`} className="underline-offset-4 hover:underline">
                          {payment.date.toISOString().slice(0, 10)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{payment.method ?? '—'}</TableCell>
                      <TableCell numeric>{formatMoney(payment.amount.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Unapplied credits</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/credit-memos/new?customer=${customer.id}`}>New credit memo</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {credits.length === 0 ? (
              <p className="text-muted-foreground px-5 pb-5 text-sm">
                No credit is waiting to be applied.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Memo</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead numeric>Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.map((credit) => (
                    <TableRow key={credit.id}>
                      <TableCell>
                        <Link href={`/credit-memos/${credit.id}`} className="font-medium underline-offset-4 hover:underline">
                          {credit.memoNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{credit.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell numeric>{formatMoney(credit.balanceRemaining.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="size-4" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{customer.notes}</CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'negative' | 'positive'
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p
          className={`num mt-1 text-xl font-semibold tracking-tight ${
            tone === 'negative' ? 'text-destructive' : ''
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function Detail({
  label,
  value,
  href,
}: {
  label: string
  value?: string | null
  href?: string | null
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        href ? (
          <a className="text-primary underline-offset-4 hover:underline" href={href}>
            {value}
          </a>
        ) : (
          <span className="whitespace-pre-line">{value}</span>
        )
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  )
}
