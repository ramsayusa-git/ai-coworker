import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PencilIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { itemMovements } from '@/server/inventory'
import { cents, formatMoney, qty } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ItemActiveToggle } from './item-actions'

export const metadata = { title: 'Item' }

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: 'Received',
  SALE: 'Sold',
  ADJUSTMENT: 'Adjusted',
  RETURN_IN: 'Returned in',
  RETURN_OUT: 'Returned out',
  VOID: 'Reversed',
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const item = await db.item.findUnique({
    where: { id },
    include: { income: true, expense: true, asset: true },
  })
  if (!item) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const onHand = qty(item.quantityOnHand.toString())
  const avgCost = qty(item.avgCost.toString())
  const reorder = qty(item.reorderPoint.toString())
  const lowStock =
    item.trackInventory &&
    (onHand.isNegative() || (reorder.isPositive() && onHand.lessThanOrEqualTo(reorder)))

  const [movements, recentLines] = await Promise.all([
    item.trackInventory ? itemMovements(db, item.id, 50) : Promise.resolve([]),
    db.invoiceLine.findMany({
      where: { itemId: item.id },
      orderBy: { id: 'desc' },
      take: 10,
      include: { invoice: { select: { id: true, invoiceNumber: true, date: true, status: true } } },
    }),
  ])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={item.name}
        description={item.description ?? 'An item you can put on an invoice.'}
        actions={
          <>
            <ItemActiveToggle id={item.id} isActive={item.isActive} />
            <Button asChild size="sm">
              <Link href={`/items/${item.id}/edit`}><PencilIcon /> Edit</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales price" value={formatMoney(item.rate.toString(), currency)} />
        {item.trackInventory ? (
          <>
            <Stat
              label="On hand"
              value={onHand.toFixed(2)}
              note={lowStock ? (onHand.isNegative() ? 'Oversold' : 'At or below reorder point') : undefined}
            />
            <Stat label="Average cost" value={formatMoney(avgCost, currency)} />
            <Stat label="Stock value" value={formatMoney(cents(onHand.times(avgCost)), currency)} />
          </>
        ) : (
          <>
            <Stat label="Purchase cost" value={formatMoney(item.cost.toString(), currency)} />
            <Stat label="Inventory" value="Not tracked" />
            <Stat label="Sales tax" value={item.isTaxable ? 'Charged' : 'Exempt'} />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Posting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Detail label="Income" value={item.income?.name ?? 'Default sales account'} />
            <Detail label="Expense" value={item.expense?.name ?? 'Default cost of goods sold'} />
            {item.trackInventory && (
              <Detail label="Inventory asset" value={item.asset?.name ?? 'Default inventory asset'} />
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="muted">{item.itemType.toLowerCase()}</Badge>
              {item.isTaxable ? (
                <Badge variant="muted">Taxable</Badge>
              ) : (
                <Badge variant="outline">Tax exempt</Badge>
              )}
              {item.trackInventory && <Badge variant="muted">Stock tracked</Badge>}
              {!item.isActive && <Badge variant="outline">Inactive</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{item.trackInventory ? 'Stock movements' : 'Recently invoiced'}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {item.trackInventory ? (
              movements.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  No stock has moved yet. Receiving a bill or selling this item will start the trail.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead numeric>Quantity</TableHead>
                      <TableHead numeric>Unit cost</TableHead>
                      <TableHead numeric>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="whitespace-nowrap">
                          {movement.date.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">
                            {MOVEMENT_LABEL[movement.movementType] ?? movement.movementType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-56 truncate text-xs">
                          {movement.memo ?? '—'}
                        </TableCell>
                        <TableCell numeric>{qty(movement.quantity.toString()).toFixed(2)}</TableCell>
                        <TableCell numeric>{formatMoney(movement.unitCost.toString(), currency)}</TableCell>
                        <TableCell numeric>{qty(movement.balanceQty.toString()).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : recentLines.length === 0 ? (
              <p className="text-muted-foreground px-5 pb-5 text-sm">
                This item has not been invoiced yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead numeric>Quantity</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Link
                          href={`/invoices/${line.invoice.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {line.invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{line.invoice.date.toISOString().slice(0, 10)}</TableCell>
                      <TableCell numeric>{qty(line.quantity.toString()).toFixed(2)}</TableCell>
                      <TableCell numeric>{formatMoney(line.amount.toString(), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="num mt-1 text-xl font-semibold tracking-tight">{value}</p>
        {note && <p className="text-destructive mt-0.5 text-xs">{note}</p>}
      </CardContent>
    </Card>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}
