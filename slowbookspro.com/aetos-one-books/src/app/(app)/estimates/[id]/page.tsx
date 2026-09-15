import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PencilIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { cogsForSale } from '@/server/inventory'
import { cents, formatMoney, money, qty, sum, ZERO } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { DocumentStatus } from '@/components/app/document-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EstimateStatusActions } from './estimate-actions'

export const metadata = { title: 'Estimate' }

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const estimate = await db.estimate.findUnique({
    where: { id },
    include: {
      customer: true,
      estimateLines: { orderBy: { lineOrder: 'asc' }, include: { item: true } },
      convertedInvoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
  })
  if (!estimate) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxRatePercent = Number(estimate.taxRate.toString()) * 100

  // What the stock on this quote would cost to ship today, at the running
  // weighted average. Nothing is moved — this is the margin view, not a posting.
  const lineCosts = await Promise.all(
    estimate.estimateLines.map((line) =>
      line.itemId == null ? Promise.resolve(ZERO) : cogsForSale(db, line.itemId, line.quantity.toString()),
    ),
  )
  const estimatedCost = cents(sum(lineCosts))
  const subtotal = money(estimate.subtotal.toString())
  const margin = cents(subtotal.minus(estimatedCost))
  const marginPercent = subtotal.isZero()
    ? null
    : margin.dividedBy(subtotal).times(100).toDecimalPlaces(1)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Estimate ${estimate.estimateNumber}`}
        description={`${estimate.customer.name} · ${estimate.date.toISOString().slice(0, 10)}`}
        actions={
          <>
            <EstimateStatusActions id={estimate.id} status={estimate.status} />
            {estimate.status !== 'CONVERTED' && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/estimates/${estimate.id}/edit`}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <DocumentStatus kind="estimate" status={estimate.status} />
        {estimate.expirationDate && (
          <span className="text-muted-foreground text-sm">
            Expires {estimate.expirationDate.toISOString().slice(0, 10)}
          </span>
        )}
        {estimate.convertedInvoice && (
          <Link
            href={`/invoices/${estimate.convertedInvoice.id}`}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Invoice {estimate.convertedInvoice.invoiceNumber}
          </Link>
        )}
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
                  {estimate.estimateLines.map((line) => (
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

          <Card>
            <CardHeader>
              <CardTitle>What this posted</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {estimate.convertedInvoice ? (
                <p>
                  Nothing — an estimate is not a financial event. The posting happened on{' '}
                  <Link
                    href={`/invoices/${estimate.convertedInvoice.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    invoice {estimate.convertedInvoice.invoiceNumber}
                  </Link>
                  .
                </p>
              ) : (
                <p>
                  Nothing — an estimate is not a financial event. Convert it to an invoice to debit
                  accounts receivable and credit income.
                </p>
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
              <Row label="Subtotal" value={formatMoney(estimate.subtotal.toString(), currency)} />
              {taxRatePercent > 0 && (
                <Row
                  label={`Sales tax (${taxRatePercent.toFixed(2)}%)`}
                  value={formatMoney(estimate.taxAmount.toString(), currency)}
                />
              )}
              <Separator />
              <Row label="Total" value={formatMoney(estimate.total.toString(), currency)} strong />
              {estimatedCost.isPositive() && (
                <>
                  <Separator />
                  <Row label="Stock cost at today’s average" value={formatMoney(estimatedCost, currency)} />
                  <Row
                    label={
                      marginPercent === null
                        ? 'Gross margin'
                        : `Gross margin (${marginPercent.toFixed(1)}%)`
                    }
                    value={formatMoney(margin, currency)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Tracked items only, valued at their weighted average. Nothing has moved — the
                    cost posts when this becomes an invoice.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quoted to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link
                href={`/customers/${estimate.customerId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {estimate.customer.name}
              </Link>
              {estimate.customer.email && (
                <p className="text-muted-foreground">{estimate.customer.email}</p>
              )}
              {estimate.customer.phone && (
                <p className="text-muted-foreground">{estimate.customer.phone}</p>
              )}
            </CardContent>
          </Card>

          {estimate.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{estimate.notes}</CardContent>
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
