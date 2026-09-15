import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { openBills } from '@/server/purchasing'
import { formatMoney, money, qty } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { VendorCreditStatusBadge } from '../../bills/bill-status'
import { VendorCreditActions, type ApplicableBill } from './credit-actions'

export const metadata = { title: 'Vendor credit' }

export default async function VendorCreditPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const credit = await db.vendorCredit.findUnique({
    where: { id },
    include: {
      vendor: true,
      originalBill: { select: { id: true, billNumber: true } },
      vendorCreditLines: { orderBy: { lineOrder: 'asc' }, include: { item: true, account: true } },
      vendorCreditApplications: { include: { bill: true } },
    },
  })
  if (!credit) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxRatePercent = Number(credit.taxRate.toString()) * 100

  const [postings, open] = await Promise.all([
    db.transaction.findMany({
      where: { sourceId: credit.id, sourceType: 'vendor_credit' },
      orderBy: { id: 'asc' },
      include: { transactionLines: { include: { account: true } } },
    }),
    openBills(db, credit.vendorId),
  ])

  const applicable: ApplicableBill[] = open.map((bill) => ({
    id: bill.id,
    label: `${bill.billNumber} · ${bill.date.toISOString().slice(0, 10)}`,
    balanceDue: bill.balanceDue.toString(),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Vendor credit ${credit.creditNumber}`}
        description={`${credit.vendor.name} · ${credit.date.toISOString().slice(0, 10)}`}
        actions={
          <VendorCreditActions
            id={credit.id}
            status={credit.status}
            balanceRemaining={credit.balanceRemaining.toString()}
            bills={applicable}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <VendorCreditStatusBadge status={credit.status} />
        {credit.refNumber && <Badge variant="muted">Ref {credit.refNumber}</Badge>}
        {credit.originalBill && (
          <Badge variant="outline">
            <Link href={`/bills/${credit.originalBill.id}`}>Against {credit.originalBill.billNumber}</Link>
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
                  {credit.vendorCreditLines.map((line) => (
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

          {credit.vendorCreditApplications.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Applied to</CardTitle></CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead numeric>Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credit.vendorCreditApplications.map((application) => (
                      <TableRow key={application.id}>
                        <TableCell className="font-medium">
                          <Link href={`/bills/${application.bill.id}`} className="underline-offset-4 hover:underline">
                            {application.bill.billNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{application.bill.date.toISOString().slice(0, 10)}</TableCell>
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
              <Row label="Subtotal" value={formatMoney(credit.subtotal.toString(), currency)} />
              {taxRatePercent > 0 && (
                <Row
                  label={`Tax (${taxRatePercent.toFixed(2)}%)`}
                  value={formatMoney(credit.taxAmount.toString(), currency)}
                />
              )}
              <Separator />
              <Row label="Credit total" value={formatMoney(credit.total.toString(), currency)} strong />
              <Row label="Applied" value={formatMoney(credit.amountApplied.toString(), currency)} muted />
              <Row
                label="Still unapplied"
                value={formatMoney(credit.balanceRemaining.toString(), currency)}
                strong
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vendor</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <Link
                href={`/vendors/${credit.vendorId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {credit.vendor.name}
              </Link>
            </CardContent>
          </Card>

          {credit.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{credit.notes}</CardContent>
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
