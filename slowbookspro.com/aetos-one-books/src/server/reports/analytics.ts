import 'server-only'
import { Decimal } from 'decimal.js'
import { money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { Prisma } from '@/generated/tenant/client'
import { monthKey, monthLabel } from './params'

/**
 * Analytics: the document-driven view. Where the statements answer "what does
 * the ledger say", these answer "what is happening" — how revenue is trending,
 * how long customers take to pay, what cash is expected to do over the next
 * quarter.
 *
 * Everything crosses the boundary as a plain number because it is bound for a
 * chart in a client component; the arithmetic up to that point is Decimal.
 */

const dec = (value: Prisma.Decimal | null | undefined) => money(value?.toString() ?? 0)
const num = (value: Decimal) => value.toDecimalPlaces(2).toNumber()
const dayMs = 86_400_000

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

export type TrendPoint = {
  month: string
  label: string
  invoiced: number
  collected: number
  expenses: number
}

/**
 * Revenue trend by month: what was invoiced, what was actually collected, and
 * what was spent. Dense — a month with no activity is a zero, not a gap.
 */
export async function revenueTrend(
  db: TenantClient,
  opts: { months: number; to: Date },
): Promise<TrendPoint[]> {
  const start = utc(opts.to.getUTCFullYear(), opts.to.getUTCMonth() - (opts.months - 1), 1)

  const [invoices, payments, expenseLines] = await Promise.all([
    db.invoice.findMany({
      where: { status: { not: 'VOID' }, date: { gte: start, lte: opts.to } },
      select: { date: true, total: true },
    }),
    db.payment.findMany({
      where: { isVoided: false, date: { gte: start, lte: opts.to } },
      select: { date: true, amount: true },
    }),
    db.transactionLine.findMany({
      where: {
        transaction: { isVoided: false, date: { gte: start, lte: opts.to } },
        account: { accountType: { in: ['EXPENSE', 'COGS'] } },
      },
      select: { debit: true, credit: true, transaction: { select: { date: true } } },
    }),
  ])

  const buckets = new Map<string, { invoiced: Decimal; collected: Decimal; expenses: Decimal }>()
  for (let index = 0; index < opts.months; index += 1) {
    const month = utc(start.getUTCFullYear(), start.getUTCMonth() + index, 1)
    buckets.set(monthKey(month), { invoiced: ZERO, collected: ZERO, expenses: ZERO })
  }

  for (const invoice of invoices) {
    const bucket = buckets.get(monthKey(invoice.date))
    if (bucket) bucket.invoiced = bucket.invoiced.plus(dec(invoice.total))
  }
  for (const payment of payments) {
    const bucket = buckets.get(monthKey(payment.date))
    if (bucket) bucket.collected = bucket.collected.plus(dec(payment.amount))
  }
  for (const line of expenseLines) {
    const bucket = buckets.get(monthKey(line.transaction.date))
    if (bucket) bucket.expenses = bucket.expenses.plus(dec(line.debit).minus(dec(line.credit)))
  }

  return [...buckets.entries()].map(([key, value]) => ({
    month: key,
    label: monthLabel(new Date(`${key}-01T00:00:00.000Z`)),
    invoiced: num(value.invoiced),
    collected: num(value.collected),
    expenses: num(value.expenses),
  }))
}

export type DsoResult = {
  days: number
  arBalance: number
  revenueLast90: number
  /** Average age, in days, of the invoices that are actually open. */
  averageAge: number
}

/**
 * Days sales outstanding: how long a dollar of sales sits in receivables.
 * Computed on a 90-day revenue base so a single large invoice cannot swing it.
 */
export async function daysSalesOutstanding(db: TenantClient, opts: { asOf: Date }): Promise<DsoResult> {
  const since = new Date(opts.asOf.getTime() - 90 * dayMs)

  const [open, recent] = await Promise.all([
    db.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIAL'] }, balanceDue: { gt: 0 }, date: { lte: opts.asOf } },
      select: { balanceDue: true, date: true },
    }),
    db.invoice.aggregate({
      where: { status: { not: 'VOID' }, date: { gte: since, lte: opts.asOf } },
      _sum: { total: true },
    }),
  ])

  const arBalance = sum(open.map((invoice) => dec(invoice.balanceDue)))
  const revenue = dec(recent._sum.total)
  const days = revenue.isZero() ? ZERO : arBalance.dividedBy(revenue).times(90)

  const weighted = open.length
    ? sum(
        open.map((invoice) =>
          dec(invoice.balanceDue).times(
            Math.max(0, Math.floor((opts.asOf.getTime() - invoice.date.getTime()) / dayMs)),
          ),
        ),
      )
    : ZERO

  return {
    days: Math.round(days.toNumber()),
    arBalance: num(arBalance),
    revenueLast90: num(revenue),
    averageAge: arBalance.isZero() ? 0 : Math.round(weighted.dividedBy(arBalance).toNumber()),
  }
}

export type ForecastPoint = {
  date: string
  label: string
  collections: number
  payments: number
  net: number
  cash: number
}

/**
 * Cumulative cash forecast over the next 90 days, in weekly steps: everything
 * receivable due by each date against everything payable due by the same date,
 * started from today's bank balance. Bucket zero is "already due" — money that
 * should have arrived and has not is part of the picture, not excluded from it.
 */
export async function cashForecast(
  db: TenantClient,
  opts: { from: Date; days?: number },
): Promise<ForecastPoint[]> {
  const days = opts.days ?? 90
  const horizon = new Date(opts.from.getTime() + days * dayMs)

  const [receivables, payables, cashAccounts] = await Promise.all([
    db.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIAL'] }, balanceDue: { gt: 0 } },
      select: { dueDate: true, date: true, balanceDue: true },
    }),
    db.bill
      .findMany({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, balanceDue: { gt: 0 } },
        select: { dueDate: true, date: true, balanceDue: true },
      })
      .catch(() => [] as { dueDate: Date | null; date: Date; balanceDue: Prisma.Decimal }[]),
    db.account.findMany({ where: { bankKind: 'bank' }, select: { id: true } }),
  ])

  const opening = cashAccounts.length
    ? await db.transactionLine
        .aggregate({
          where: {
            accountId: { in: cashAccounts.map((a) => a.id) },
            transaction: { isVoided: false, date: { lte: opts.from } },
          },
          _sum: { debit: true, credit: true },
        })
        .then((totals) => dec(totals._sum.debit).minus(dec(totals._sum.credit)))
    : ZERO

  const offsets: number[] = []
  for (let offset = 0; offset < days; offset += 7) offsets.push(offset)
  if (offsets[offsets.length - 1] !== days) offsets.push(days)

  const due = (row: { dueDate: Date | null; date: Date }) => row.dueDate ?? row.date

  return offsets.map((offset) => {
    const at = new Date(opts.from.getTime() + offset * dayMs)
    const collections = sum(
      receivables.filter((r) => due(r) <= at).map((r) => dec(r.balanceDue)),
    )
    const outgoing = sum(payables.filter((p) => due(p) <= at).map((p) => dec(p.balanceDue)))
    const net = collections.minus(outgoing)
    return {
      date: at.toISOString().slice(0, 10),
      label:
        offset === 0
          ? 'Due now'
          : at.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      collections: num(collections),
      payments: num(outgoing),
      net: num(net),
      cash: num(opening.plus(net)),
    }
  }).filter((point) => new Date(`${point.date}T00:00:00.000Z`) <= horizon)
}

export type RankedRow = { id: number; name: string; value: number; share: number }

/** Top customers by revenue invoiced over the period. */
export async function topCustomers(
  db: TenantClient,
  opts: { from: Date; to: Date; limit?: number },
): Promise<RankedRow[]> {
  const grouped = await db.invoice.groupBy({
    by: ['customerId'],
    where: { status: { not: 'VOID' }, date: { gte: opts.from, lte: opts.to } },
    _sum: { total: true },
  })
  const customers = await db.customer.findMany({
    where: { id: { in: grouped.map((g) => g.customerId) } },
    select: { id: true, name: true },
  })
  const names = new Map(customers.map((c) => [c.id, c.name]))

  const totals = sum(grouped.map((g) => dec(g._sum.total)))
  return grouped
    .map((group) => {
      const value = dec(group._sum.total)
      return {
        id: group.customerId,
        name: names.get(group.customerId) ?? 'Unknown',
        value: num(value),
        share: totals.isZero() ? 0 : num(value.dividedBy(totals).times(100)),
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, opts.limit ?? 8)
}

/** Top items by revenue over the period. */
export async function topItems(
  db: TenantClient,
  opts: { from: Date; to: Date; limit?: number },
): Promise<RankedRow[]> {
  const lines = await db.invoiceLine.findMany({
    where: {
      itemId: { not: null },
      invoice: { status: { not: 'VOID' }, date: { gte: opts.from, lte: opts.to } },
    },
    select: { itemId: true, amount: true, item: { select: { name: true } } },
  })

  const byItem = new Map<number, { name: string; value: Decimal }>()
  for (const line of lines) {
    if (line.itemId == null) continue
    const entry = byItem.get(line.itemId) ?? { name: line.item?.name ?? 'Unknown', value: ZERO }
    entry.value = entry.value.plus(dec(line.amount))
    byItem.set(line.itemId, entry)
  }

  const total = sum([...byItem.values()].map((v) => v.value))
  return [...byItem.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      value: num(value.value),
      share: total.isZero() ? 0 : num(value.value.dividedBy(total).times(100)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, opts.limit ?? 8)
}

/** Expense mix by account for the period — the top slices, then "everything else". */
export async function expenseMix(
  db: TenantClient,
  opts: { from: Date; to: Date; limit?: number },
): Promise<RankedRow[]> {
  const grouped = await db.transactionLine.groupBy({
    by: ['accountId'],
    where: {
      transaction: { isVoided: false, date: { gte: opts.from, lte: opts.to } },
      account: { accountType: { in: ['EXPENSE', 'COGS'] } },
    },
    _sum: { debit: true, credit: true },
  })
  const accounts = await db.account.findMany({
    where: { id: { in: grouped.map((g) => g.accountId) } },
    select: { id: true, name: true },
  })
  const names = new Map(accounts.map((a) => [a.id, a.name]))

  const rows = grouped
    .map((group) => ({
      id: group.accountId,
      name: names.get(group.accountId) ?? 'Unknown',
      raw: dec(group._sum.debit).minus(dec(group._sum.credit)),
    }))
    .filter((row) => row.raw.greaterThan(0))
    .sort((a, b) => b.raw.comparedTo(a.raw))

  const total = sum(rows.map((r) => r.raw))
  const limit = opts.limit ?? 6
  const head = rows.slice(0, limit)
  const tail = rows.slice(limit)

  const mapped: RankedRow[] = head.map((row) => ({
    id: row.id,
    name: row.name,
    value: num(row.raw),
    share: total.isZero() ? 0 : num(row.raw.dividedBy(total).times(100)),
  }))

  if (tail.length) {
    const rest = sum(tail.map((r) => r.raw))
    mapped.push({
      id: -1,
      name: `${tail.length} other accounts`,
      value: num(rest),
      share: total.isZero() ? 0 : num(rest.dividedBy(total).times(100)),
    })
  }

  return mapped
}

export type AnalyticsDashboard = {
  from: Date
  to: Date
  trend: TrendPoint[]
  dso: DsoResult
  forecast: ForecastPoint[]
  customers: RankedRow[]
  items: RankedRow[]
  expenses: RankedRow[]
  headline: {
    invoiced: number
    collected: number
    expenses: number
    net: number
    openReceivables: number
  }
}

/** One round trip for the analytics page. */
export async function analyticsDashboard(
  db: TenantClient,
  opts: { from: Date; to: Date },
): Promise<AnalyticsDashboard> {
  const [trend, dso, forecast, customers, items, expenses, invoiced, expenseTotals] =
    await Promise.all([
      revenueTrend(db, { months: 12, to: opts.to }),
      daysSalesOutstanding(db, { asOf: opts.to }),
      cashForecast(db, { from: opts.to, days: 90 }),
      topCustomers(db, opts),
      topItems(db, opts),
      expenseMix(db, opts),
      db.invoice.aggregate({
        where: { status: { not: 'VOID' }, date: { gte: opts.from, lte: opts.to } },
        _sum: { total: true },
      }),
      db.transactionLine.aggregate({
        where: {
          transaction: { isVoided: false, date: { gte: opts.from, lte: opts.to } },
          account: { accountType: { in: ['EXPENSE', 'COGS'] } },
        },
        _sum: { debit: true, credit: true },
      }),
    ])

  const collected = await db.payment.aggregate({
    where: { isVoided: false, date: { gte: opts.from, lte: opts.to } },
    _sum: { amount: true },
  })

  const invoicedTotal = dec(invoiced._sum.total)
  const expenseTotal = dec(expenseTotals._sum.debit).minus(dec(expenseTotals._sum.credit))

  return {
    from: opts.from,
    to: opts.to,
    trend,
    dso,
    forecast,
    customers,
    items,
    expenses,
    headline: {
      invoiced: num(invoicedTotal),
      collected: num(dec(collected._sum.amount)),
      expenses: num(expenseTotal),
      net: num(invoicedTotal.minus(expenseTotal)),
      openReceivables: dso.arBalance,
    },
  }
}
