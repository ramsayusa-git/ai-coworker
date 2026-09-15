import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PencilIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { formatMoney, qty } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PoStatusBadge } from '../../bills/bill-status'
import { PurchaseOrderActions, type ReceivableLine } from './po-actions'

export const metadata = { title: 'Purchase order' }

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      purchaseOrderLines: { orderBy: { lineOrder: 'asc' }, include: { item: true } },
      bills: { select: { id: true, billNumber: true } },
    },
  })
  if (!po) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxRatePercent = Number(po.taxRate.toString()) * 100

  const receivable: ReceivableLine[] = po.purchaseOrderLines.map((line) => ({
    id: line.id,
    label: line.item?.name ?? line.description ?? `Line ${(line.lineOrder ?? 0) + 1}`,
    ordered: qty(line.quantity.toString()).toFixed(4),
    received: qty(line.receivedQty.toString()).toFixed(4),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Purchase order ${po.poNumber}`}
        description={`${po.vendor.name} · ${po.date.toISOString().slice(0, 10)}`}
        actions={
          <>
            {po.status !== 'CLOSED' && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/purchase-orders/${po.id}/edit`}><PencilIcon /> Edit</Link>
              </Button>
            )}
            <PurchaseOrderActions
              id={po.id}
              poNumber={po.poNumber}
              status={po.status}
              lines={receivable}
              today={toDateInput(startOfToday())}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PoStatusBadge status={po.status} />
        {po.expectedDate && (
          <span className="text-muted-foreground text-sm">
            Expected {po.expectedDate.toISOString().slice(0, 10)}
          </span>
        )}
        {po.bills.map((bill) => (
          <Badge key={bill.id} variant="outline">
            <Link href={`/bills/${bill.id}`}>Billed as {bill.billNumber}</Link>
          </Badge>
        ))}
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
                    <TableHead>Description</TableHead>
                    <TableHead numeric>Ordered</TableHead>
                    <TableHead numeric>Received</TableHead>
                    <TableHead numeric>Cost</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.purchaseOrderLines.map((line) => {
                    const ordered = qty(line.quantity.toString())
                    const received = qty(line.receivedQty.toString())
                    const short = received.lessThan(ordered)
                    return (
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
                        <TableCell className="max-w-72 truncate">{line.description ?? '—'}</TableCell>
                        <TableCell numeric>{ordered.toFixed(2)}</TableCell>
                        <TableCell numeric>
                          <span className={short ? 'text-muted-foreground' : 'text-positive'}>
                            {received.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell numeric>{formatMoney(line.rate.toString(), currency)}</TableCell>
                        <TableCell numeric>{formatMoney(line.amount.toString(), currency)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>What this posted</CardTitle></CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Nothing. A purchase order is a commitment, not a transaction — the ledger moves when
              it becomes a bill.
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(po.subtotal.toString(), currency)} />
              {taxRatePercent > 0 && (
                <Row
                  label={`Tax (${taxRatePercent.toFixed(2)}%)`}
                  value={formatMoney(po.taxAmount.toString(), currency)}
                />
              )}
              <Separator />
              <Row label="Total" value={formatMoney(po.total.toString(), currency)} strong />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vendor</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link
                href={`/vendors/${po.vendorId}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {po.vendor.name}
              </Link>
              {po.vendor.email && <p className="text-muted-foreground">{po.vendor.email}</p>}
            </CardContent>
          </Card>

          {po.shipTo && (
            <Card>
              <CardHeader><CardTitle>Ship to</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{po.shipTo}</CardContent>
            </Card>
          )}

          {po.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{po.notes}</CardContent>
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
