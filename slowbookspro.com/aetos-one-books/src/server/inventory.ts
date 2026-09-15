import 'server-only'
import { Decimal } from 'decimal.js'
import { cents, money, qty as quantizeQty, ZERO } from '@/lib/money'
import { InventoryMovementType, type Prisma } from '@/generated/tenant/client'
import type { TenantClient } from '@/lib/tenant-db'

/**
 * Perpetual, weighted-average inventory.
 *
 * One entry point — `recordMovement` — owns the item cache (`quantityOnHand`,
 * `avgCost`) and the immutable `inventory_movements` trail. Everything else in
 * this file is a named wrapper around it so call sites read like the business
 * event they represent (a sale, a return, a reversal, an adjustment).
 *
 * Costing rules:
 *   - Inbound (quantity > 0) revalues: newAvg = (oldQty·oldAvg + qty·unitCost) / newQty.
 *   - Outbound (quantity < 0) never revalues the remaining stock; it consumes
 *     the current average and reports that value as COGS.
 *   - A balance of exactly zero resets the average to zero, so the next receipt
 *     sets the cost rather than blending with a stale one.
 *
 * Negative stock is allowed — a bill entered after the invoice it supplies is
 * ordinary — but every movement that leaves or keeps the balance below zero is
 * flagged so the caller (and the low-stock report) can surface it.
 *
 * No journal entry is posted from here. Inventory movements and their GL effect
 * are two halves of one document; the document's service posts the pair inside a
 * single transaction so they commit together.
 */

export type MovementClient = TenantClient | Prisma.TransactionClient

export type RecordMovementInput = {
  itemId: number
  type: InventoryMovementType
  /** Signed: positive receives stock, negative issues it. */
  quantity: Decimal.Value
  /**
   * Cost per unit for this movement. Required in spirit for inbound movements;
   * omitted on outbound ones, where the item's current average is used.
   */
  unitCost?: Decimal.Value | null
  date?: Date
  /** The journal entry this movement belongs to, when there is one. */
  transactionId?: number | null
  /** Free-text trail, e.g. `INV-1042` — stored on the movement memo. */
  reference?: string | null
  sourceType?: string | null
  sourceId?: number | null
}

export type MovementResult = {
  movementId: number
  /** Value released to cost of goods sold by this movement; zero for receipts. */
  cogs: Decimal
  quantityOnHand: Decimal
  avgCost: Decimal
  /** True when the item is oversold after this movement. */
  negative: boolean
  /** The unit cost actually applied (the item average, for outbound movements). */
  unitCost: Decimal
}

export class UnknownItemError extends Error {
  status = 404
  constructor(itemId: number) {
    super(`Item ${itemId} not found`)
    this.name = 'UnknownItemError'
  }
}

/**
 * Apply one signed movement to an item and write its audit row.
 * Returns the COGS value released (outbound) or zero (inbound).
 */
export async function recordMovement(
  tx: MovementClient,
  input: RecordMovementInput,
): Promise<MovementResult | null> {
  const quantity = quantizeQty(input.quantity)
  if (quantity.isZero()) return null

  const client = tx as TenantClient
  const item = await client.item.findUnique({ where: { id: input.itemId } })
  if (!item) throw new UnknownItemError(input.itemId)

  // Untracked items are a no-op, so callers never have to branch.
  if (!item.trackInventory) return null

  const oldQty = quantizeQty(item.quantityOnHand.toString())
  const oldAvg = quantizeQty(item.avgCost.toString())

  // An explicit cost wins (a receipt, or a reversal replaying a historical
  // cost); otherwise the movement happens at the item's running average.
  const unitCost = quantizeQty(input.unitCost ?? oldAvg)

  const newQty = quantizeQty(oldQty.plus(quantity))
  const newAvg = nextAverage({ oldQty, oldAvg, quantity, unitCost, newQty })

  // Outbound movements release value; inbound ones absorb it.
  const cogs = quantity.isNegative() ? cents(quantity.negated().times(unitCost)) : ZERO

  const movement = await client.inventoryMovement.create({
    data: {
      itemId: item.id,
      date: input.date ?? new Date(),
      movementType: input.type,
      quantity: quantity.toFixed(4),
      unitCost: unitCost.toFixed(4),
      balanceQty: newQty.toFixed(4),
      balanceAvgCost: newAvg.toFixed(4),
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      transactionId: input.transactionId ?? null,
      memo: input.reference ?? null,
    },
  })

  await client.item.update({
    where: { id: item.id },
    data: { quantityOnHand: newQty.toFixed(4), avgCost: newAvg.toFixed(4) },
  })

  return {
    movementId: movement.id,
    cogs,
    quantityOnHand: newQty,
    avgCost: newAvg,
    negative: newQty.isNegative(),
    unitCost,
  }
}

function nextAverage(args: {
  oldQty: Decimal
  oldAvg: Decimal
  quantity: Decimal
  unitCost: Decimal
  newQty: Decimal
}): Decimal {
  const { oldQty, oldAvg, quantity, unitCost, newQty } = args
  if (newQty.isZero()) return ZERO
  if (quantity.isPositive() && newQty.isPositive()) {
    const value = oldQty.times(oldAvg).plus(quantity.times(unitCost))
    return quantizeQty(value.dividedBy(newQty))
  }
  // Issues and returns-out consume stock at the running average; they never
  // revalue what is left. Receiving into a negative balance is the one case
  // where a blend would invent a cost, so the receipt cost wins outright.
  if (quantity.isPositive()) return unitCost
  return oldAvg
}

/**
 * What issuing `quantity` of an item would release to cost of goods sold, at
 * the item's current weighted average — without moving anything.
 *
 * Posting routines call this to size the `DR cost of goods sold / CR inventory`
 * pair before the movement is written, and quoting and margin screens call it
 * to show the cost side of a sale that has not happened yet. An untracked item,
 * a missing item or a non-positive quantity all cost nothing.
 */
export async function cogsForSale(
  tx: MovementClient,
  itemId: number,
  quantity: Decimal.Value,
): Promise<Decimal> {
  const issued = quantizeQty(quantity)
  if (!issued.isPositive()) return ZERO
  const item = await (tx as TenantClient).item.findUnique({
    where: { id: itemId },
    select: { trackInventory: true, avgCost: true },
  })
  if (!item?.trackInventory) return ZERO
  return cents(issued.times(quantizeQty(item.avgCost.toString())))
}

/**
 * Issue stock for a sale. Returns the COGS value the caller must post as
 * `DR cost of goods sold / CR inventory`.
 */
export function recordSale(
  tx: MovementClient,
  args: {
    itemId: number
    quantity: Decimal.Value
    date?: Date
    reference?: string | null
    sourceType?: string
    sourceId?: number
    transactionId?: number | null
  },
) {
  const quantity = quantizeQty(args.quantity)
  if (!quantity.isPositive()) return Promise.resolve(null)
  return recordMovement(tx, {
    itemId: args.itemId,
    type: InventoryMovementType.SALE,
    quantity: quantity.negated(),
    date: args.date,
    reference: args.reference,
    sourceType: args.sourceType ?? 'invoice',
    sourceId: args.sourceId,
    transactionId: args.transactionId,
  })
}

/**
 * Put stock back at the cost it originally left at, so a void balances even
 * when the running average has moved since. Falls back to the current average
 * when no original movement can be found.
 */
export async function reverseSale(
  tx: MovementClient,
  args: {
    itemId: number
    quantity: Decimal.Value
    date?: Date
    reference?: string | null
    sourceType: string
    sourceId?: number
    originalSourceType: string
    originalSourceId: number
    transactionId?: number | null
  },
) {
  const quantity = quantizeQty(args.quantity)
  if (!quantity.isPositive()) return null

  const client = tx as TenantClient
  const original = await client.inventoryMovement.findFirst({
    where: {
      itemId: args.itemId,
      sourceType: args.originalSourceType,
      sourceId: args.originalSourceId,
      movementType: InventoryMovementType.SALE,
    },
    orderBy: { id: 'desc' },
  })

  return recordMovement(tx, {
    itemId: args.itemId,
    type: InventoryMovementType.VOID,
    quantity,
    unitCost: original ? original.unitCost.toString() : null,
    date: args.date,
    reference: args.reference,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    transactionId: args.transactionId,
  })
}

/** Customer returned goods: stock comes back in at the current average. */
export function recordReturnIn(
  tx: MovementClient,
  args: {
    itemId: number
    quantity: Decimal.Value
    date?: Date
    reference?: string | null
    sourceType: string
    sourceId?: number
  },
) {
  const quantity = quantizeQty(args.quantity)
  if (!quantity.isPositive()) return Promise.resolve(null)
  return recordMovement(tx, {
    itemId: args.itemId,
    type: InventoryMovementType.RETURN_IN,
    quantity,
    date: args.date,
    reference: args.reference,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
  })
}

/** Undo a return (credit memo void): the goods go back out again. */
export function recordReturnOut(
  tx: MovementClient,
  args: {
    itemId: number
    quantity: Decimal.Value
    date?: Date
    reference?: string | null
    sourceType: string
    sourceId?: number
  },
) {
  const quantity = quantizeQty(args.quantity)
  if (!quantity.isPositive()) return Promise.resolve(null)
  return recordMovement(tx, {
    itemId: args.itemId,
    type: InventoryMovementType.RETURN_OUT,
    quantity: quantity.negated(),
    date: args.date,
    reference: args.reference,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
  })
}

/** Manual count correction. A positive delta receives at `unitCost`. */
export function adjustStock(
  tx: MovementClient,
  args: {
    itemId: number
    delta: Decimal.Value
    unitCost?: Decimal.Value | null
    date?: Date
    memo?: string | null
  },
) {
  return recordMovement(tx, {
    itemId: args.itemId,
    type: InventoryMovementType.ADJUSTMENT,
    quantity: args.delta,
    unitCost: args.unitCost ?? null,
    date: args.date,
    reference: args.memo ?? 'Stock adjustment',
    sourceType: 'adjustment',
  })
}

/** Items at or below their reorder point, worst shortage first. */
export async function lowStock(db: TenantClient) {
  const items = await db.item.findMany({
    where: { trackInventory: true, isActive: true },
    orderBy: { name: 'asc' },
  })

  return items
    .map((item) => {
      const onHand = quantizeQty(item.quantityOnHand.toString())
      const reorder = quantizeQty(item.reorderPoint.toString())
      const shortage = reorder.minus(onHand)
      return {
        id: item.id,
        name: item.name,
        quantityOnHand: onHand,
        reorderPoint: reorder,
        avgCost: quantizeQty(item.avgCost.toString()),
        shortage: shortage.isPositive() ? shortage : ZERO,
      }
    })
    .filter(
      (row) =>
        row.quantityOnHand.isNegative() ||
        (row.reorderPoint.isPositive() && row.quantityOnHand.lessThanOrEqualTo(row.reorderPoint)),
    )
    .sort((a, b) => b.shortage.comparedTo(a.shortage) || a.name.localeCompare(b.name))
}

/** Total value of tracked stock: Σ quantity × average cost. */
export async function inventoryValuation(db: TenantClient) {
  const items = await db.item.findMany({ where: { trackInventory: true } })
  let total = ZERO
  const rows = items.map((item) => {
    const onHand = quantizeQty(item.quantityOnHand.toString())
    const avgCost = quantizeQty(item.avgCost.toString())
    const value = cents(onHand.times(avgCost))
    total = total.plus(value)
    return { id: item.id, name: item.name, quantityOnHand: onHand, avgCost, value }
  })
  return { rows, total: cents(total) }
}

/** Recent movements for one item, newest first. */
export function itemMovements(db: TenantClient, itemId: number, take = 200) {
  return db.inventoryMovement.findMany({
    where: { itemId },
    orderBy: { id: 'desc' },
    take: Math.min(Math.max(take, 1), 1000),
  })
}

export const inventoryValue = (quantity: Decimal.Value, unitCost: Decimal.Value) =>
  cents(money(quantity).times(money(unitCost)))
