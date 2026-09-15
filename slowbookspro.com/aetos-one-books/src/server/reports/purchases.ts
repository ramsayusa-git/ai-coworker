import 'server-only'
import { Decimal } from 'decimal.js'
import { money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { BillStatus, Prisma } from '@/generated/tenant/client'

/**
 * Purchase-side reporting: where the money went, who is still owed, and what
 * has to go on a 1099 in January.
 *
 * These read the bill, vendor and bill-payment tables directly rather than
 * going through a purchasing service, so the reports stand up on their own
 * while that module is still being built. Every query runs through `safely()`:
 * if the purchasing tables are not in this environment yet, the report renders
 * empty with a note instead of a stack trace.
 */

const OPEN_BILL: BillStatus[] = ['UNPAID', 'PARTIAL']
const dayMs = 86_400_000
const THRESHOLD_1099 = new Decimal(600)

const dec = (value: Prisma.Decimal | null | undefined) => money(value?.toString() ?? 0)

export const PURCHASING_PENDING_NOTE =
  'The purchasing module is still landing; this report reads the bill tables directly and shows nothing until bills are posted.'

/** Run a purchase-side query, degrading to a fallback if the tables are absent. */
async function safely<T>(run: () => Promise<T>, fallback: T): Promise<{ value: T; degraded: boolean }> {
  try {
    return { value: await run(), degraded: false }
  } catch {
    return { value: fallback, degraded: true }
  }
}

export type VendorSpendRow = {
  vendorId: number
  name: string
  bills: number
  billed: Decimal
  paid: Decimal
  balance: Decimal
  share: Decimal
}

/** Expenses by vendor over a period: billed, settled, outstanding. */
export async function expensesByVendor(db: TenantClient, opts: { from: Date; to: Date }) {
  const { value: bills, degraded } = await safely(
    () =>
      db.bill.findMany({
        where: { status: { not: 'VOID' }, date: { gte: opts.from, lte: opts.to } },
        select: {
          vendorId: true,
          total: true,
          amountPaid: true,
          balanceDue: true,
          vendor: { select: { name: true } },
        },
      }),
    [] as { vendorId: number; total: Prisma.Decimal; amountPaid: Prisma.Decimal; balanceDue: Prisma.Decimal; vendor: { name: string } }[],
  )

  const byVendor = new Map<number, VendorSpendRow>()
  for (const bill of bills) {
    const row =
      byVendor.get(bill.vendorId) ??
      {
        vendorId: bill.vendorId,
        name: bill.vendor.name,
        bills: 0,
        billed: ZERO,
        paid: ZERO,
        balance: ZERO,
        share: ZERO,
      }
    row.bills += 1
    row.billed = row.billed.plus(dec(bill.total))
    row.paid = row.paid.plus(dec(bill.amountPaid))
    row.balance = row.balance.plus(dec(bill.balanceDue))
    byVendor.set(bill.vendorId, row)
  }

  const rows = [...byVendor.values()].sort((a, b) => b.billed.comparedTo(a.billed))
  const totalBilled = sum(rows.map((r) => r.billed))
  for (const row of rows) {
    row.share = totalBilled.isZero() ? ZERO : row.billed.dividedBy(totalBilled).times(100)
  }

  return {
    rows,
    totalBilled,
    totalPaid: sum(rows.map((r) => r.paid)),
    totalBalance: sum(rows.map((r) => r.balance)),
    degraded,
  }
}

export type ExpenseCategoryRow = {
  accountId: number | null
  accountNumber: string
  name: string
  amount: Decimal
  share: Decimal
}

/**
 * Expenses by category. Read from the ledger, not from bill lines, so cash
 * expenses, card charges and payroll land in the same report as bills — the
 * P&L expense total and this report agree by construction.
 */
export async function expensesByCategory(db: TenantClient, opts: { from: Date; to: Date }) {
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
    select: { id: true, name: true, accountNumber: true },
  })
  const meta = new Map(accounts.map((a) => [a.id, a]))

  const rows: ExpenseCategoryRow[] = grouped
    .map((group) => {
      const account = meta.get(group.accountId)
      return {
        accountId: group.accountId,
        accountNumber: account?.accountNumber ?? '',
        name: account?.name ?? 'Unknown account',
        amount: dec(group._sum.debit).minus(dec(group._sum.credit)),
        share: ZERO,
      }
    })
    .filter((row) => !row.amount.isZero())
    .sort((a, b) => b.amount.comparedTo(a.amount))

  const total = sum(rows.map((r) => r.amount))
  for (const row of rows) {
    row.share = total.isZero() ? ZERO : row.amount.dividedBy(total).times(100)
  }

  return { rows, total }
}

export type OpenBillRow = {
  billId: number
  billNumber: string
  vendorId: number
  vendorName: string
  date: Date
  dueDate: Date | null
  daysOverdue: number
  status: BillStatus
  total: Decimal
  paid: Decimal
  balance: Decimal
}

/** Open bills as of a date, oldest due first — what to pay next. */
export async function openBills(db: TenantClient, opts: { asOf: Date; vendorId?: number | null }) {
  const { value: bills, degraded } = await safely(
    () =>
      db.bill.findMany({
        where: {
          status: { in: OPEN_BILL },
          date: { lte: opts.asOf },
          balanceDue: { gt: 0 },
          ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
        },
        select: {
          id: true,
          billNumber: true,
          vendorId: true,
          date: true,
          dueDate: true,
          status: true,
          total: true,
          amountPaid: true,
          balanceDue: true,
          vendor: { select: { name: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
        take: 1000,
      }),
    [] as {
      id: number
      billNumber: string
      vendorId: number
      date: Date
      dueDate: Date | null
      status: BillStatus
      total: Prisma.Decimal
      amountPaid: Prisma.Decimal
      balanceDue: Prisma.Decimal
      vendor: { name: string }
    }[],
  )

  const rows: OpenBillRow[] = bills.map((bill) => {
    const due = bill.dueDate ?? bill.date
    return {
      billId: bill.id,
      billNumber: bill.billNumber,
      vendorId: bill.vendorId,
      vendorName: bill.vendor.name,
      date: bill.date,
      dueDate: bill.dueDate,
      daysOverdue: Math.max(0, Math.floor((opts.asOf.getTime() - due.getTime()) / dayMs)),
      status: bill.status,
      total: dec(bill.total),
      paid: dec(bill.amountPaid),
      balance: dec(bill.balanceDue),
    }
  })

  return {
    rows,
    totalBalance: sum(rows.map((r) => r.balance)),
    overdueBalance: sum(rows.filter((r) => r.daysOverdue > 0).map((r) => r.balance)),
    overdueCount: rows.filter((r) => r.daysOverdue > 0).length,
    degraded,
  }
}

export const AP_BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+'] as const
export type ApBucket = (typeof AP_BUCKETS)[number]

function bucketFor(days: number): ApBucket {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1–30'
  if (days <= 60) return '31–60'
  if (days <= 90) return '61–90'
  return '90+'
}

export type ApDetailRow = OpenBillRow & { bucket: ApBucket }

/** AP detail: every open bill, aged, grouped by vendor. */
export async function apDetail(db: TenantClient, opts: { asOf: Date; vendorId?: number | null }) {
  const { rows: open, degraded } = await openBills(db, opts)
  const rows: ApDetailRow[] = open.map((bill) => ({ ...bill, bucket: bucketFor(bill.daysOverdue) }))

  const byVendor = new Map<number, { name: string; rows: ApDetailRow[]; total: Decimal }>()
  for (const row of rows) {
    const bucket = byVendor.get(row.vendorId) ?? { name: row.vendorName, rows: [], total: ZERO }
    bucket.rows.push(row)
    bucket.total = bucket.total.plus(row.balance)
    byVendor.set(row.vendorId, bucket)
  }

  const groups = [...byVendor.entries()]
    .map(([vendorId, value]) => ({ vendorId, ...value }))
    .sort((a, b) => b.total.comparedTo(a.total))

  const bucketTotals = Object.fromEntries(
    AP_BUCKETS.map((bucket) => [
      bucket,
      sum(rows.filter((r) => r.bucket === bucket).map((r) => r.balance)),
    ]),
  ) as Record<ApBucket, Decimal>

  return { rows, groups, bucketTotals, grandTotal: sum(rows.map((r) => r.balance)), degraded }
}

export type Vendor1099Row = {
  vendorId: number
  name: string
  taxId: string
  boxType: string
  w9OnFile: boolean
  totalPaid: Decimal
  aboveThreshold: boolean
}

/**
 * 1099 summary for a calendar year: cash actually paid to vendors flagged as
 * 1099 vendors, against the $600 reporting threshold. Payments are counted from
 * the allocations, so a voided payment drops out.
 */
export async function summary1099(db: TenantClient, opts: { year: number }) {
  const from = new Date(Date.UTC(opts.year, 0, 1))
  const to = new Date(Date.UTC(opts.year, 11, 31))

  const { value, degraded } = await safely(
    async () => {
      const vendors = await db.vendor.findMany({
        where: { OR: [{ is1099Vendor: true }, { is1099Eligible: true }] },
        select: {
          id: true,
          name: true,
          taxId: true,
          vendor1099Type: true,
          w9OnFile: true,
        },
      })
      if (vendors.length === 0) return { vendors, payments: [] as { vendorId: number; amount: Decimal }[] }

      const payments = await db.billPayment.findMany({
        where: {
          isVoided: false,
          date: { gte: from, lte: to },
          vendorId: { in: vendors.map((v) => v.id) },
        },
        select: { vendorId: true, amount: true },
      })
      return {
        vendors,
        payments: payments.map((p) => ({ vendorId: p.vendorId, amount: dec(p.amount) })),
      }
    },
    { vendors: [] as { id: number; name: string; taxId: string | null; vendor1099Type: string | null; w9OnFile: boolean }[], payments: [] as { vendorId: number; amount: Decimal }[] },
  )

  const paidByVendor = new Map<number, Decimal>()
  for (const payment of value.payments) {
    paidByVendor.set(payment.vendorId, (paidByVendor.get(payment.vendorId) ?? ZERO).plus(payment.amount))
  }

  const rows: Vendor1099Row[] = value.vendors
    .map((vendor) => {
      const totalPaid = paidByVendor.get(vendor.id) ?? ZERO
      return {
        vendorId: vendor.id,
        name: vendor.name,
        taxId: vendor.taxId ?? '',
        boxType: vendor.vendor1099Type ?? 'NEC',
        w9OnFile: vendor.w9OnFile,
        totalPaid,
        aboveThreshold: totalPaid.greaterThanOrEqualTo(THRESHOLD_1099),
      }
    })
    .sort((a, b) => b.totalPaid.comparedTo(a.totalPaid))

  return {
    year: opts.year,
    rows,
    total: sum(rows.map((r) => r.totalPaid)),
    reportable: rows.filter((r) => r.aboveThreshold).length,
    missingTaxId: rows.filter((r) => r.aboveThreshold && r.taxId === '').length,
    threshold: THRESHOLD_1099,
    degraded,
  }
}

/** Vendors for the report shell's vendor filter. */
export async function reportVendors(db: TenantClient) {
  const { value } = await safely(
    () =>
      db.vendor.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    [] as { id: number; name: string }[],
  )
  return value
}
