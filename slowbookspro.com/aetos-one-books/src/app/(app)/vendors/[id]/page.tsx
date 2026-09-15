import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PencilIcon, PlusIcon, WalletIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { formatMoney, money, sum, ZERO } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BillStatusBadge } from '../../bills/bill-status'
import { VendorStatusActions } from './vendor-actions'

export const metadata = { title: 'Vendor' }

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const vendor = await db.vendor.findUnique({
    where: { id },
    include: { defaultExpenseAccount: { select: { name: true, accountNumber: true } } },
  })
  if (!vendor) notFound()

  const currency = settings.get('base_currency') || 'USD'

  const [bills, payments, credits, orders] = await Promise.all([
    db.bill.findMany({
      where: { vendorId: id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 25,
    }),
    db.billPayment.findMany({
      where: { vendorId: id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
    db.vendorCredit.findMany({
      where: { vendorId: id, status: { not: 'VOID' } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
    db.purchaseOrder.findMany({
      where: { vendorId: id, status: { not: 'CLOSED' } },
      orderBy: [{ date: 'desc' }],
      take: 10,
    }),
  ])

  const open = sum(
    bills.filter((bill) => bill.status !== 'VOID').map((bill) => money(bill.balanceDue.toString())),
  )
  const unappliedCredit = sum(credits.map((credit) => money(credit.balanceRemaining.toString())))
  const address = [
    vendor.address1,
    vendor.address2,
    [vendor.city, vendor.state, vendor.zip].filter(Boolean).join(' '),
    vendor.country,
  ].filter((part) => part && String(part).trim() !== '')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={vendor.name}
        description={vendor.companyName ?? 'Vendor'}
        actions={
          <>
            <VendorStatusActions id={vendor.id} isActive={vendor.isActive} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/vendors/${vendor.id}/edit`}><PencilIcon /> Edit</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/bill-payments/new?vendor=${vendor.id}`}><WalletIcon /> Pay bills</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/bills/new?vendor=${vendor.id}`}><PlusIcon /> New bill</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {vendor.isActive ? <Badge variant="muted">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
        {vendor.is1099Vendor && <Badge variant="outline">1099 tracked</Badge>}
        {vendor.is1099Eligible && <Badge variant="outline">1099 eligible</Badge>}
        {vendor.w9OnFile && <Badge variant="muted">W-9 on file</Badge>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Bills</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {bills.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">No bills from this vendor yet.</p>
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
                    {bills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">
                          <Link href={`/bills/${bill.id}`} className="underline-offset-4 hover:underline">
                            {bill.billNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{bill.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell>{bill.dueDate?.toISOString().slice(0, 10) ?? '—'}</TableCell>
                        <TableCell>
                          <BillStatusBadge status={bill.status} dueDate={bill.dueDate} balanceDue={bill.balanceDue.toString()} />
                        </TableCell>
                        <TableCell numeric>{formatMoney(bill.total.toString(), currency)}</TableCell>
                        <TableCell numeric>{formatMoney(bill.balanceDue.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {orders.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Open purchase orders</CardTitle></CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead numeric>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">
                          <Link href={`/purchase-orders/${po.id}`} className="underline-offset-4 hover:underline">
                            {po.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{po.date.toISOString().slice(0, 10)}</TableCell>
                        <TableCell><Badge variant="muted">{po.status.toLowerCase()}</Badge></TableCell>
                        <TableCell numeric>{formatMoney(po.total.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {payments.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent payments</CardTitle></CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead numeric>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id} className={payment.isVoided ? 'opacity-60' : undefined}>
                        <TableCell>
                          <Link href={`/bill-payments/${payment.id}`} className="underline-offset-4 hover:underline">
                            {payment.date.toISOString().slice(0, 10)}
                          </Link>
                        </TableCell>
                        <TableCell>{payment.method ?? '—'}</TableCell>
                        <TableCell>{payment.checkNumber ?? (payment.isVoided ? 'Voided' : '—')}</TableCell>
                        <TableCell numeric>{formatMoney(payment.amount.toString(), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Open bills" value={formatMoney(open, currency)} strong />
              <Row label="Unapplied credits" value={formatMoney(unappliedCredit, currency)} muted />
              <Separator />
              <Row
                label="Net owed"
                value={formatMoney(open.minus(unappliedCredit.greaterThan(ZERO) ? unappliedCredit : ZERO), currency)}
                strong
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {vendor.email && <p className="text-muted-foreground">{vendor.email}</p>}
              {vendor.phone && <p className="text-muted-foreground">{vendor.phone}</p>}
              {vendor.website && <p className="text-muted-foreground">{vendor.website}</p>}
              {address.map((part, index) => (
                <p key={index} className="text-muted-foreground">{part}</p>
              ))}
              {address.length === 0 && !vendor.email && !vendor.phone && (
                <p className="text-muted-foreground">No contact details recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Posting</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Terms" value={vendor.terms ?? 'Net 30'} />
              <Row
                label="Default account"
                value={
                  vendor.defaultExpenseAccount
                    ? `${vendor.defaultExpenseAccount.accountNumber ?? ''} ${vendor.defaultExpenseAccount.name}`.trim()
                    : 'Uncategorised expense'
                }
              />
              <Row label="Tax ID" value={vendor.taxId ?? '—'} />
            </CardContent>
          </Card>

          {vendor.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{vendor.notes}</CardContent>
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
