import 'server-only'
import { Decimal } from 'decimal.js'
import { money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { AccountType } from '@/generated/tenant/client'

/**
 * The three statements plus the aging reports, computed from the ledger — not
 * from document tables. Anything that posts correctly shows up here, which is
 * the whole reason for a double-entry core.
 */

export type StatementRow = {
  accountId: number
  accountNumber: string
  name: string
  type: AccountType
  amount: Decimal
}

type Period = { from?: Date; to: Date }

async function balancesByAccount(db: TenantClient, period: Period, types: AccountType[]) {
  const grouped = await db.transactionLine.groupBy({
    by: ['accountId'],
    where: {
      transaction: {
        isVoided: false,
        date: { ...(period.from ? { gte: period.from } : {}), lte: period.to },
      },
      account: { accountType: { in: types } },
    },
    _sum: { debit: true, credit: true },
  })

  const accounts = await db.account.findMany({
    where: { id: { in: grouped.map((g) => g.accountId) } },
  })
  const byId = new Map(accounts.map((a) => [a.id, a]))

  return grouped
    .map((row) => {
      const account = byId.get(row.accountId)!
      const debit = money(row._sum.debit?.toString() ?? 0)
      const credit = money(row._sum.credit?.toString() ?? 0)
      const debitNormal = account.accountType === 'ASSET' || account.accountType === 'EXPENSE' || account.accountType === 'COGS'
      return {
        accountId: account.id,
        accountNumber: account.accountNumber ?? '',
        name: account.name,
        type: account.accountType,
        amount: debitNormal ? debit.minus(credit) : credit.minus(debit),
      }
    })
    .filter((r) => !r.amount.isZero())
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
}

/** Profit and loss for a period. */
export async function profitAndLoss(db: TenantClient, from: Date, to: Date) {
  const rows = await balancesByAccount(db, { from, to }, ['INCOME', 'COGS', 'EXPENSE'])
  const income = rows.filter((r) => r.type === 'INCOME')
  const cogs = rows.filter((r) => r.type === 'COGS')
  const expenses = rows.filter((r) => r.type === 'EXPENSE')

  const totalIncome = sum(income.map((r) => r.amount))
  const totalCogs = sum(cogs.map((r) => r.amount))
  const grossProfit = totalIncome.minus(totalCogs)
  const totalExpenses = sum(expenses.map((r) => r.amount))

  return {
    from,
    to,
    income,
    cogs,
    expenses,
    totalIncome,
    totalCogs,
    grossProfit,
    totalExpenses,
    netIncome: grossProfit.minus(totalExpenses),
  }
}

/** Balance sheet as of a date, with net income folded into equity. */
export async function balanceSheet(db: TenantClient, asOf: Date) {
  const rows = await balancesByAccount(db, { to: asOf }, ['ASSET', 'LIABILITY', 'EQUITY'])
  const assets = rows.filter((r) => r.type === 'ASSET')
  const liabilities = rows.filter((r) => r.type === 'LIABILITY')
  const equity = rows.filter((r) => r.type === 'EQUITY')

  const pl = await profitAndLoss(db, new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)), asOf)

  const totalAssets = sum(assets.map((r) => r.amount))
  const totalLiabilities = sum(liabilities.map((r) => r.amount))
  const totalEquity = sum(equity.map((r) => r.amount)).plus(pl.netIncome)

  return {
    asOf,
    assets,
    liabilities,
    equity,
    netIncome: pl.netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    /** Zero when the ledger is sound. Shown, never hidden. */
    outOfBalance: totalAssets.minus(totalLiabilities.plus(totalEquity)),
  }
}

const BUCKETS = [
  { label: 'Current', min: -Infinity, max: 0 },
  { label: '1-30', min: 1, max: 30 },
  { label: '31-60', min: 31, max: 60 },
  { label: '61-90', min: 61, max: 90 },
  { label: '90+', min: 91, max: Infinity },
]

function bucketFor(daysOverdue: number) {
  return BUCKETS.find((b) => daysOverdue >= b.min && daysOverdue <= b.max)!.label
}

const dayMs = 86_400_000

/** AR aging by customer, from open invoices. */
export async function arAging(db: TenantClient, asOf: Date) {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ['SENT', 'PARTIAL'] }, date: { lte: asOf } },
    include: { customer: true },
  })

  const rows = new Map<number, { name: string; buckets: Record<string, Decimal>; total: Decimal }>()

  for (const invoice of invoices) {
    const due = invoice.dueDate ?? invoice.date
    const daysOverdue = Math.floor((asOf.getTime() - due.getTime()) / dayMs)
    const open = money(invoice.total.toString()).minus(money(invoice.amountPaid?.toString() ?? 0))
    if (open.lessThanOrEqualTo(0)) continue

    const entry =
      rows.get(invoice.customerId) ??
      {
        name: invoice.customer.name,
        buckets: Object.fromEntries(BUCKETS.map((b) => [b.label, ZERO])) as Record<string, Decimal>,
        total: ZERO,
      }
    const bucket = bucketFor(daysOverdue)
    entry.buckets[bucket] = entry.buckets[bucket].plus(open)
    entry.total = entry.total.plus(open)
    rows.set(invoice.customerId, entry)
  }

  const list = [...rows.entries()].map(([customerId, v]) => ({ customerId, ...v }))
  return {
    asOf,
    buckets: BUCKETS.map((b) => b.label),
    rows: list.sort((a, b) => b.total.comparedTo(a.total)),
    totals: Object.fromEntries(
      BUCKETS.map((b) => [b.label, sum(list.map((r) => r.buckets[b.label]))]),
    ),
    grandTotal: sum(list.map((r) => r.total)),
  }
}

/** AP aging by vendor, from open bills. Same buckets as AR — deliberately. */
export async function apAging(db: TenantClient, asOf: Date) {
  const bills = await db.bill.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] }, date: { lte: asOf } },
    include: { vendor: true },
  })

  const rows = new Map<number, { name: string; buckets: Record<string, Decimal>; total: Decimal }>()

  for (const bill of bills) {
    const due = bill.dueDate ?? bill.date
    const daysOverdue = Math.floor((asOf.getTime() - due.getTime()) / dayMs)
    const open = money(bill.total.toString()).minus(money(bill.amountPaid?.toString() ?? 0))
    if (open.lessThanOrEqualTo(0)) continue

    const entry =
      rows.get(bill.vendorId) ??
      {
        name: bill.vendor.name,
        buckets: Object.fromEntries(BUCKETS.map((b) => [b.label, ZERO])) as Record<string, Decimal>,
        total: ZERO,
      }
    const bucket = bucketFor(daysOverdue)
    entry.buckets[bucket] = entry.buckets[bucket].plus(open)
    entry.total = entry.total.plus(open)
    rows.set(bill.vendorId, entry)
  }

  const list = [...rows.entries()].map(([vendorId, v]) => ({ vendorId, ...v }))
  return {
    asOf,
    buckets: BUCKETS.map((b) => b.label),
    rows: list.sort((a, b) => b.total.comparedTo(a.total)),
    totals: Object.fromEntries(
      BUCKETS.map((b) => [b.label, sum(list.map((r) => r.buckets[b.label]))]),
    ),
    grandTotal: sum(list.map((r) => r.total)),
  }
}

/** Cash position across bank and card accounts. */
export async function cashPosition(db: TenantClient, asOf: Date) {
  const accounts = await db.account.findMany({
    where: { bankKind: { in: ['bank', 'credit_card'] }, isActive: true },
    orderBy: { accountNumber: 'asc' },
  })

  const balances = await Promise.all(
    accounts.map(async (account) => {
      const totals = await db.transactionLine.aggregate({
        where: { accountId: account.id, transaction: { isVoided: false, date: { lte: asOf } } },
        _sum: { debit: true, credit: true },
      })
      const debit = money(totals._sum.debit?.toString() ?? 0)
      const credit = money(totals._sum.credit?.toString() ?? 0)
      const balance = account.bankKind === 'bank' ? debit.minus(credit) : credit.minus(debit)
      return { account, balance }
    }),
  )

  return {
    accounts: balances,
    cash: sum(balances.filter((b) => b.account.bankKind === 'bank').map((b) => b.balance)),
    cards: sum(balances.filter((b) => b.account.bankKind === 'credit_card').map((b) => b.balance)),
  }
}

/** Monthly income/expense series for the dashboard chart. */
export async function monthlySeries(db: TenantClient, months: number, to: Date) {
  const start = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1))
  const lines = await db.transactionLine.findMany({
    where: {
      transaction: { isVoided: false, date: { gte: start, lte: to } },
      account: { accountType: { in: ['INCOME', 'EXPENSE', 'COGS'] } },
    },
    select: {
      debit: true,
      credit: true,
      account: { select: { accountType: true } },
      transaction: { select: { date: true } },
    },
  })

  const buckets = new Map<string, { income: Decimal; expense: Decimal }>()
  for (let i = 0; i < months; i += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    buckets.set(d.toISOString().slice(0, 7), { income: ZERO, expense: ZERO })
  }

  for (const line of lines) {
    const key = line.transaction.date.toISOString().slice(0, 7)
    const bucket = buckets.get(key)
    if (!bucket) continue
    const debit = money(line.debit.toString())
    const credit = money(line.credit.toString())
    if (line.account.accountType === 'INCOME') {
      bucket.income = bucket.income.plus(credit.minus(debit))
    } else {
      bucket.expense = bucket.expense.plus(debit.minus(credit))
    }
  }

  return [...buckets.entries()].map(([month, v]) => ({
    month,
    income: v.income.toNumber(),
    expense: v.expense.toNumber(),
    net: v.income.minus(v.expense).toNumber(),
  }))
}
