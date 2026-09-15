import 'server-only'
import { Decimal } from 'decimal.js'
import { money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { Prisma } from '@/generated/tenant/client'

/**
 * Inventory reporting: what is on the shelf, what it is worth, what it cost to
 * sell. Valuation is the item's cached quantity times its weighted average
 * cost — the same pair the posting engine maintains — and the report shows the
 * inventory asset account alongside it so a divergence is visible rather than
 * quietly wrong.
 */

const dec = (value: Prisma.Decimal | null | undefined) => money(value?.toString() ?? 0)

export type ValuationRow = {
  itemId: number
  name: string
  quantity: Decimal
  avgCost: Decimal
  value: Decimal
  share: Decimal
}

export async function inventoryValuation(db: TenantClient, opts: { asOf: Date }) {
  const [items, assetAccounts] = await Promise.all([
    db.item.findMany({
      where: { trackInventory: true },
      select: { id: true, name: true, quantityOnHand: true, avgCost: true, isActive: true },
      orderBy: { name: 'asc' },
    }),
    db.account.findMany({
      where: { accountNumber: { startsWith: '13' }, accountType: 'ASSET' },
      select: { id: true, name: true, accountNumber: true },
    }),
  ])

  const rows: ValuationRow[] = items.map((item) => {
    const quantity = dec(item.quantityOnHand)
    const avgCost = dec(item.avgCost)
    return {
      itemId: item.id,
      name: item.name,
      quantity,
      avgCost,
      value: quantity.times(avgCost).toDecimalPlaces(2),
      share: ZERO,
    }
  })

  const total = sum(rows.map((r) => r.value))
  for (const row of rows) {
    row.share = total.isZero() ? ZERO : row.value.dividedBy(total).times(100)
  }

  const ledgerValue = assetAccounts.length
    ? await db.transactionLine
        .aggregate({
          where: {
            accountId: { in: assetAccounts.map((a) => a.id) },
            transaction: { isVoided: false, date: { lte: opts.asOf } },
          },
          _sum: { debit: true, credit: true },
        })
        .then((totals) => dec(totals._sum.debit).minus(dec(totals._sum.credit)))
    : ZERO

  return {
    rows: rows.filter((r) => !r.quantity.isZero() || !r.value.isZero()),
    total,
    ledgerValue,
    variance: total.minus(ledgerValue),
    accounts: assetAccounts,
  }
}

export type StockStatusRow = {
  itemId: number
  name: string
  quantity: Decimal
  reorderPoint: Decimal
  shortfall: Decimal
  /** 'ok' | 'reorder' | 'out' | 'negative' — never colour alone in the UI. */
  state: 'ok' | 'reorder' | 'out' | 'negative'
  avgCost: Decimal
  rate: Decimal
  soldLast90: Decimal
}

/** Stock status: what to reorder, what has run out, what has gone negative. */
export async function stockStatus(db: TenantClient, opts: { asOf: Date }) {
  const since = new Date(opts.asOf.getTime() - 90 * 86_400_000)

  const [items, movements] = await Promise.all([
    db.item.findMany({
      where: { trackInventory: true, isActive: true },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        reorderPoint: true,
        avgCost: true,
        rate: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.inventoryMovement.groupBy({
      by: ['itemId'],
      where: { movementType: 'SALE', date: { gte: since, lte: opts.asOf } },
      _sum: { quantity: true },
    }),
  ])

  const soldById = new Map(movements.map((m) => [m.itemId, dec(m._sum.quantity).abs()]))

  const rows: StockStatusRow[] = items.map((item) => {
    const quantity = dec(item.quantityOnHand)
    const reorderPoint = dec(item.reorderPoint)
    const state: StockStatusRow['state'] = quantity.isNegative()
      ? 'negative'
      : quantity.isZero()
        ? 'out'
        : !reorderPoint.isZero() && quantity.lessThanOrEqualTo(reorderPoint)
          ? 'reorder'
          : 'ok'
    return {
      itemId: item.id,
      name: item.name,
      quantity,
      reorderPoint,
      shortfall: reorderPoint.minus(quantity).greaterThan(0) ? reorderPoint.minus(quantity) : ZERO,
      state,
      avgCost: dec(item.avgCost),
      rate: dec(item.rate),
      soldLast90: soldById.get(item.id) ?? ZERO,
    }
  })

  return {
    rows,
    needsAttention: rows.filter((r) => r.state !== 'ok').length,
    onHandValue: sum(rows.map((r) => r.quantity.times(r.avgCost).toDecimalPlaces(2))),
  }
}

export type CogsRow = {
  itemId: number
  name: string
  quantitySold: Decimal
  cogs: Decimal
  revenue: Decimal
  margin: Decimal
  marginPercent: Decimal
}

/**
 * COGS by item over a period, taken from the inventory ledger (the cost that
 * actually posted at the time of the sale), with revenue from the matching
 * invoice lines so the margin is the real one, not a standard-cost guess.
 */
export async function cogsByItem(db: TenantClient, opts: { from: Date; to: Date }) {
  const [movements, invoiceLines] = await Promise.all([
    db.inventoryMovement.findMany({
      where: {
        movementType: { in: ['SALE', 'RETURN_IN'] },
        date: { gte: opts.from, lte: new Date(opts.to.getTime() + 86_399_000) },
      },
      select: {
        itemId: true,
        quantity: true,
        unitCost: true,
        item: { select: { name: true } },
      },
    }),
    db.invoiceLine.findMany({
      where: {
        itemId: { not: null },
        invoice: { status: { not: 'VOID' }, date: { gte: opts.from, lte: opts.to } },
      },
      select: { itemId: true, amount: true },
    }),
  ])

  const revenueById = new Map<number, Decimal>()
  for (const line of invoiceLines) {
    if (line.itemId == null) continue
    revenueById.set(line.itemId, (revenueById.get(line.itemId) ?? ZERO).plus(dec(line.amount)))
  }

  const byItem = new Map<number, CogsRow>()
  for (const movement of movements) {
    const row =
      byItem.get(movement.itemId) ??
      {
        itemId: movement.itemId,
        name: movement.item.name,
        quantitySold: ZERO,
        cogs: ZERO,
        revenue: ZERO,
        margin: ZERO,
        marginPercent: ZERO,
      }
    // Sales are stored with a negative quantity; a return in reverses it.
    const sold = dec(movement.quantity).negated()
    row.quantitySold = row.quantitySold.plus(sold)
    row.cogs = row.cogs.plus(sold.times(dec(movement.unitCost)).toDecimalPlaces(2))
    byItem.set(movement.itemId, row)
  }

  const rows = [...byItem.values()]
    .map((row) => {
      const revenue = revenueById.get(row.itemId) ?? ZERO
      const margin = revenue.minus(row.cogs)
      return {
        ...row,
        revenue,
        margin,
        marginPercent: revenue.isZero() ? ZERO : margin.dividedBy(revenue).times(100),
      }
    })
    .sort((a, b) => b.cogs.comparedTo(a.cogs))

  return {
    rows,
    totalCogs: sum(rows.map((r) => r.cogs)),
    totalRevenue: sum(rows.map((r) => r.revenue)),
    totalMargin: sum(rows.map((r) => r.margin)),
  }
}
