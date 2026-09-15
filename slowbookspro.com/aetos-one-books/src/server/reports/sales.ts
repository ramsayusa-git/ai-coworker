import 'server-only'
import { Decimal } from 'decimal.js'
import { money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { InvoiceStatus, Prisma } from '@/generated/tenant/client'

/**
 * Sales reporting, read from the document tables rather than the ledger:
 * "who bought what" is a question about invoices, not about splits. The GAAP
 * number stays the P&L — these reports are for chasing money and for seeing
 * which customers and items actually earn their keep.
 */

const OPEN: InvoiceStatus[] = ['SENT', 'PARTIAL']
const dayMs = 86_400_000

const dec = (value: Prisma.Decimal | null | undefined) => money(value?.toString() ?? 0)

export type SalesByCustomerRow = {
  customerId: number
  name: string
  invoices: number
  sales: Decimal
  paid: Decimal
  balance: Decimal
  share: Decimal
}

/** Sales by customer over a period: billed, collected, still owed. */
export async function salesByCustomer(
  db: TenantClient,
  opts: { from: Date; to: Date; classId?: number | null; jobId?: number | null },
) {
  const invoices = await db.invoice.findMany({
    where: {
      status: { not: 'VOID' },
      date: { gte: opts.from, lte: opts.to },
      ...(opts.classId ? { classId: opts.classId } : {}),
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
    },
    select: {
      customerId: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
      customer: { select: { name: true } },
    },
  })

  const byCustomer = new Map<number, SalesByCustomerRow>()
  for (const invoice of invoices) {
    const row =
      byCustomer.get(invoice.customerId) ??
      {
        customerId: invoice.customerId,
        name: invoice.customer.name,
        invoices: 0,
        sales: ZERO,
        paid: ZERO,
        balance: ZERO,
        share: ZERO,
      }
    row.invoices += 1
    row.sales = row.sales.plus(dec(invoice.total))
    row.paid = row.paid.plus(dec(invoice.amountPaid))
    row.balance = row.balance.plus(dec(invoice.balanceDue))
    byCustomer.set(invoice.customerId, row)
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.sales.comparedTo(a.sales))
  const totalSales = sum(rows.map((r) => r.sales))
  for (const row of rows) {
    row.share = totalSales.isZero() ? ZERO : row.sales.dividedBy(totalSales).times(100)
  }

  return {
    rows,
    totalSales,
    totalPaid: sum(rows.map((r) => r.paid)),
    totalBalance: sum(rows.map((r) => r.balance)),
    invoiceCount: invoices.length,
  }
}

export type SalesByItemRow = {
  itemId: number | null
  name: string
  itemType: string
  quantity: Decimal
  sales: Decimal
  cost: Decimal
  margin: Decimal
  marginPercent: Decimal
}

/**
 * Sales by item. Cost uses the item's weighted average, which is the same
 * number inventory valuation reports — a service item has no cost and shows a
 * blank margin rather than a misleading 100%.
 */
export async function salesByItem(db: TenantClient, opts: { from: Date; to: Date }) {
  const lines = await db.invoiceLine.findMany({
    where: {
      invoice: { status: { not: 'VOID' }, date: { gte: opts.from, lte: opts.to } },
    },
    select: {
      itemId: true,
      quantity: true,
      amount: true,
      description: true,
      item: { select: { name: true, itemType: true, avgCost: true, cost: true, trackInventory: true } },
    },
  })

  const byItem = new Map<string, SalesByItemRow>()
  for (const line of lines) {
    const key = line.itemId === null ? 'none' : String(line.itemId)
    const unitCost = line.item
      ? line.item.trackInventory && !dec(line.item.avgCost).isZero()
        ? dec(line.item.avgCost)
        : dec(line.item.cost)
      : ZERO
    const row =
      byItem.get(key) ??
      {
        itemId: line.itemId,
        name: line.item?.name ?? 'No item (free text lines)',
        itemType: line.item?.itemType ?? '—',
        quantity: ZERO,
        sales: ZERO,
        cost: ZERO,
        margin: ZERO,
        marginPercent: ZERO,
      }
    const quantity = dec(line.quantity)
    row.quantity = row.quantity.plus(quantity)
    row.sales = row.sales.plus(dec(line.amount))
    row.cost = row.cost.plus(quantity.times(unitCost).toDecimalPlaces(2))
    byItem.set(key, row)
  }

  const rows = [...byItem.values()]
    .map((row) => {
      const margin = row.sales.minus(row.cost)
      return {
        ...row,
        margin,
        marginPercent: row.sales.isZero() ? ZERO : margin.dividedBy(row.sales).times(100),
      }
    })
    .sort((a, b) => b.sales.comparedTo(a.sales))

  return {
    rows,
    totalQuantity: sum(rows.map((r) => r.quantity)),
    totalSales: sum(rows.map((r) => r.sales)),
    totalCost: sum(rows.map((r) => r.cost)),
    totalMargin: sum(rows.map((r) => r.margin)),
  }
}

export type OpenInvoiceRow = {
  invoiceId: number
  invoiceNumber: string
  customerId: number
  customerName: string
  date: Date
  dueDate: Date | null
  daysOverdue: number
  status: InvoiceStatus
  total: Decimal
  paid: Decimal
  balance: Decimal
}

/** Open invoices as of a date, oldest due first — the collections worklist. */
export async function openInvoices(
  db: TenantClient,
  opts: { asOf: Date; customerId?: number | null },
) {
  const invoices = await db.invoice.findMany({
    where: {
      status: { in: OPEN },
      date: { lte: opts.asOf },
      balanceDue: { gt: 0 },
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      date: true,
      dueDate: true,
      status: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
    take: 1000,
  })

  const rows: OpenInvoiceRow[] = invoices.map((invoice) => {
    const due = invoice.dueDate ?? invoice.date
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      date: invoice.date,
      dueDate: invoice.dueDate,
      daysOverdue: Math.max(0, Math.floor((opts.asOf.getTime() - due.getTime()) / dayMs)),
      status: invoice.status,
      total: dec(invoice.total),
      paid: dec(invoice.amountPaid),
      balance: dec(invoice.balanceDue),
    }
  })

  return {
    rows,
    totalBalance: sum(rows.map((r) => r.balance)),
    overdueBalance: sum(rows.filter((r) => r.daysOverdue > 0).map((r) => r.balance)),
    overdueCount: rows.filter((r) => r.daysOverdue > 0).length,
  }
}

export type StatementEntry = {
  date: Date
  kind: 'invoice' | 'payment' | 'credit'
  reference: string
  documentId: number
  charge: Decimal
  credit: Decimal
  balance: Decimal
}

export type CustomerStatement = {
  customer: { id: number; name: string; email: string | null; terms: string | null }
  from: Date
  to: Date
  opening: Decimal
  entries: StatementEntry[]
  closing: Decimal
  totalCharges: Decimal
  totalCredits: Decimal
  aging: { current: Decimal; over30: Decimal; over60: Decimal; over90: Decimal }
}

/** One customer's activity over a period, with the aging of what is still open. */
export async function customerStatement(
  db: TenantClient,
  opts: { customerId: number; from: Date; to: Date },
): Promise<CustomerStatement | null> {
  const customer = await db.customer.findUnique({
    where: { id: opts.customerId },
    select: { id: true, name: true, email: true, terms: true },
  })
  if (!customer) return null

  const [invoices, payments, credits, priorInvoices, priorPayments, priorCredits] = await Promise.all([
    db.invoice.findMany({
      where: {
        customerId: opts.customerId,
        status: { not: 'VOID' },
        date: { gte: opts.from, lte: opts.to },
      },
      select: { id: true, invoiceNumber: true, date: true, total: true, dueDate: true, balanceDue: true },
      orderBy: { date: 'asc' },
    }),
    db.payment.findMany({
      where: {
        customerId: opts.customerId,
        isVoided: false,
        date: { gte: opts.from, lte: opts.to },
      },
      select: { id: true, date: true, amount: true, reference: true, checkNumber: true, method: true },
      orderBy: { date: 'asc' },
    }),
    db.creditMemo.findMany({
      where: {
        customerId: opts.customerId,
        status: { not: 'VOID' },
        date: { gte: opts.from, lte: opts.to },
      },
      select: { id: true, memoNumber: true, date: true, total: true },
      orderBy: { date: 'asc' },
    }),
    db.invoice.aggregate({
      where: { customerId: opts.customerId, status: { not: 'VOID' }, date: { lt: opts.from } },
      _sum: { total: true },
    }),
    db.payment.aggregate({
      where: { customerId: opts.customerId, isVoided: false, date: { lt: opts.from } },
      _sum: { amount: true },
    }),
    db.creditMemo.aggregate({
      where: { customerId: opts.customerId, status: { not: 'VOID' }, date: { lt: opts.from } },
      _sum: { total: true },
    }),
  ])

  const opening = dec(priorInvoices._sum.total)
    .minus(dec(priorPayments._sum.amount))
    .minus(dec(priorCredits._sum.total))

  const unsorted: Omit<StatementEntry, 'balance'>[] = [
    ...invoices.map((invoice) => ({
      date: invoice.date,
      kind: 'invoice' as const,
      reference: invoice.invoiceNumber,
      documentId: invoice.id,
      charge: dec(invoice.total),
      credit: ZERO,
    })),
    ...payments.map((payment) => ({
      date: payment.date,
      kind: 'payment' as const,
      reference: payment.checkNumber || payment.reference || payment.method || 'Payment',
      documentId: payment.id,
      charge: ZERO,
      credit: dec(payment.amount),
    })),
    ...credits.map((memo) => ({
      date: memo.date,
      kind: 'credit' as const,
      reference: memo.memoNumber,
      documentId: memo.id,
      charge: ZERO,
      credit: dec(memo.total),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  let balance = opening
  const entries: StatementEntry[] = unsorted.map((entry) => {
    balance = balance.plus(entry.charge).minus(entry.credit)
    return { ...entry, balance }
  })

  const open = await db.invoice.findMany({
    where: { customerId: opts.customerId, status: { in: OPEN }, balanceDue: { gt: 0 }, date: { lte: opts.to } },
    select: { dueDate: true, date: true, balanceDue: true },
  })
  const aging = { current: ZERO, over30: ZERO, over60: ZERO, over90: ZERO }
  for (const invoice of open) {
    const due = invoice.dueDate ?? invoice.date
    const days = Math.floor((opts.to.getTime() - due.getTime()) / dayMs)
    const value = dec(invoice.balanceDue)
    if (days <= 0) aging.current = aging.current.plus(value)
    else if (days <= 30) aging.over30 = aging.over30.plus(value)
    else if (days <= 60) aging.over60 = aging.over60.plus(value)
    else aging.over90 = aging.over90.plus(value)
  }

  return {
    customer,
    from: opts.from,
    to: opts.to,
    opening,
    entries,
    closing: balance,
    totalCharges: sum(entries.map((e) => e.charge)),
    totalCredits: sum(entries.map((e) => e.credit)),
    aging,
  }
}

export type ArDetailRow = {
  invoiceId: number
  invoiceNumber: string
  customerId: number
  customerName: string
  date: Date
  dueDate: Date | null
  daysOverdue: number
  bucket: 'Current' | '1–30' | '31–60' | '61–90' | '90+'
  total: Decimal
  paid: Decimal
  balance: Decimal
}

export const AR_BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+'] as const

function bucketFor(days: number): (typeof AR_BUCKETS)[number] {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1–30'
  if (days <= 60) return '31–60'
  if (days <= 90) return '61–90'
  return '90+'
}

/** AR detail: every open invoice, aged, grouped by customer. */
export async function arDetail(db: TenantClient, opts: { asOf: Date; customerId?: number | null }) {
  const { rows: open } = await openInvoices(db, opts)

  const rows: ArDetailRow[] = open.map((invoice) => ({
    ...invoice,
    bucket: bucketFor(invoice.daysOverdue),
  }))

  const byCustomer = new Map<number, { name: string; rows: ArDetailRow[]; total: Decimal }>()
  for (const row of rows) {
    const bucket =
      byCustomer.get(row.customerId) ?? { name: row.customerName, rows: [], total: ZERO }
    bucket.rows.push(row)
    bucket.total = bucket.total.plus(row.balance)
    byCustomer.set(row.customerId, bucket)
  }

  const groups = [...byCustomer.entries()]
    .map(([customerId, value]) => ({ customerId, ...value }))
    .sort((a, b) => b.total.comparedTo(a.total))

  const bucketTotals = Object.fromEntries(
    AR_BUCKETS.map((bucket) => [
      bucket,
      sum(rows.filter((r) => r.bucket === bucket).map((r) => r.balance)),
    ]),
  ) as Record<(typeof AR_BUCKETS)[number], Decimal>

  return { rows, groups, bucketTotals, grandTotal: sum(rows.map((r) => r.balance)) }
}

/** Customers with activity, for the statement picker. */
export async function statementCustomers(db: TenantClient) {
  return db.customer.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 500,
  })
}
