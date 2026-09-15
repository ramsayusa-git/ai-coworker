import 'server-only'
import { Decimal } from 'decimal.js'
import { cents, money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { AccountType, Prisma } from '@/generated/tenant/client'

/**
 * The double-entry core. Every document in the product — invoice, bill,
 * payment, pay run, depreciation entry — ends up here. Nothing writes
 * `transaction_lines` directly.
 *
 * Rules enforced:
 *   1. A split is a debit OR a credit, never both (also a DB CHECK).
 *   2. Total debits == total credits, to the cent.
 *   3. Nothing posts on or before the closing date unless it is explicitly
 *      unlocked by an admin.
 *   4. A posted transaction is never edited or deleted — it is voided by a
 *      reversing entry, so the audit trail stays append-only.
 */

export type JournalLine = {
  accountId: number
  debit?: Decimal.Value
  credit?: Decimal.Value
  description?: string | null
  jobId?: number | null
  classId?: number | null
  costCodeId?: number | null
  costType?: string | null
  function?: string | null
  isBillable?: boolean
  billedInvoiceLineId?: number | null
}

export type JournalEntry = {
  date: Date
  description?: string | null
  reference?: string | null
  sourceType?: string | null
  sourceId?: number | null
  jobId?: number | null
  classId?: number | null
  lines: JournalLine[]
}

export class UnbalancedEntryError extends Error {
  status = 400
  constructor(public readonly debits: Decimal, public readonly credits: Decimal) {
    super(
      `Entry does not balance: debits ${debits.toFixed(2)} vs credits ${credits.toFixed(2)}`,
    )
    this.name = 'UnbalancedEntryError'
  }
}

export class ClosedPeriodError extends Error {
  status = 409
  constructor(date: Date, closingDate: Date) {
    super(
      `${date.toISOString().slice(0, 10)} falls on or before the closing date ${closingDate
        .toISOString()
        .slice(0, 10)}`,
    )
    this.name = 'ClosedPeriodError'
  }
}

/** Normal balance by account type: what a positive balance means. */
export const NORMAL_BALANCE: Record<AccountType, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  INCOME: 'CREDIT',
  EXPENSE: 'DEBIT',
  COGS: 'DEBIT',
}

export async function getClosingDate(db: TenantClient): Promise<Date | null> {
  const row = await db.setting.findUnique({ where: { key: 'closing_date' } })
  if (!row?.value) return null
  const parsed = new Date(row.value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function assertPostable(db: TenantClient, date: Date) {
  const closing = await getClosingDate(db)
  if (closing && date <= closing) throw new ClosedPeriodError(date, closing)
}

function normalise(lines: JournalLine[]) {
  return lines
    .map((line) => ({
      ...line,
      debit: cents(line.debit ?? 0),
      credit: cents(line.credit ?? 0),
    }))
    .filter((line) => !line.debit.isZero() || !line.credit.isZero())
}

/**
 * Post a balanced journal entry. Runs inside the caller's transaction when one
 * is supplied, so a document and its GL effect commit together or not at all.
 */
export async function postJournalEntry(
  db: TenantClient | Prisma.TransactionClient,
  entry: JournalEntry,
  opts: { skipClosingCheck?: boolean } = {},
) {
  const lines = normalise(entry.lines)
  if (lines.length < 2) throw new Error('A journal entry needs at least two splits')

  for (const line of lines) {
    if (!line.debit.isZero() && !line.credit.isZero()) {
      throw new Error('A split is either a debit or a credit, never both')
    }
    if (line.debit.isNegative() || line.credit.isNegative()) {
      throw new Error('Splits are never negative — swap the side instead')
    }
  }

  const debits = sum(lines.map((l) => l.debit))
  const credits = sum(lines.map((l) => l.credit))
  if (!debits.equals(credits)) throw new UnbalancedEntryError(debits, credits)
  if (debits.isZero()) throw new Error('An entry with no value is not an entry')

  if (!opts.skipClosingCheck) {
    await assertPostable(db as TenantClient, entry.date)
  }

  return (db as TenantClient).transaction.create({
    data: {
      date: entry.date,
      description: entry.description ?? null,
      reference: entry.reference ?? null,
      sourceType: entry.sourceType ?? 'journal',
      sourceId: entry.sourceId ?? null,
      jobId: entry.jobId ?? null,
      classId: entry.classId ?? null,
      transactionLines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit.toFixed(2),
          credit: line.credit.toFixed(2),
          description: line.description ?? null,
          jobId: line.jobId ?? entry.jobId ?? null,
          classId: line.classId ?? entry.classId ?? null,
          costCodeId: line.costCodeId ?? null,
          costType: line.costType ?? null,
          function: line.function ?? null,
          isBillable: line.isBillable ?? false,
          billedInvoiceLineId: line.billedInvoiceLineId ?? null,
        })),
      },
    },
    include: { transactionLines: true },
  })
}

/**
 * Void by reversal: same date (or a later one if the original period is
 * closed), sides swapped, linked back to the original. The original row is
 * never touched.
 */
export async function reverseTransaction(
  db: TenantClient,
  transactionId: number,
  opts: { date?: Date; description?: string } = {},
) {
  const original = await db.transaction.findUnique({
    where: { id: transactionId },
    include: { transactionLines: true },
  })
  if (!original) throw new Error(`Transaction ${transactionId} not found`)
  if (original.isVoided) throw new Error('Already voided')

  const date = opts.date ?? original.date
  const reversal = await postJournalEntry(db, {
    date,
    description: opts.description ?? `Reversal of ${original.reference ?? `#${original.id}`}`,
    reference: original.reference,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    lines: original.transactionLines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      description: line.description,
      jobId: line.jobId,
      classId: line.classId,
      costCodeId: line.costCodeId,
      costType: line.costType,
    })),
  })

  await db.transaction.update({
    where: { id: transactionId },
    data: { isVoided: true, voidedAt: new Date(), reversalId: reversal.id },
  })

  return reversal
}

/** Signed balance of one account, in its normal-balance direction. */
export async function accountBalance(
  db: TenantClient,
  accountId: number,
  opts: { asOf?: Date; from?: Date } = {},
): Promise<Decimal> {
  const account = await db.account.findUnique({ where: { id: accountId } })
  if (!account) throw new Error(`Account ${accountId} not found`)

  const where: Prisma.TransactionLineWhereInput = {
    accountId,
    transaction: {
      isVoided: false,
      ...(opts.asOf || opts.from
        ? { date: { ...(opts.asOf ? { lte: opts.asOf } : {}), ...(opts.from ? { gte: opts.from } : {}) } }
        : {}),
    },
  }

  const totals = await db.transactionLine.aggregate({
    where,
    _sum: { debit: true, credit: true },
  })

  const debit = money(totals._sum.debit?.toString() ?? 0)
  const credit = money(totals._sum.credit?.toString() ?? 0)
  return NORMAL_BALANCE[account.accountType] === 'DEBIT' ? debit.minus(credit) : credit.minus(debit)
}

/** Trial balance: every account with activity or a non-zero balance. */
export async function trialBalance(db: TenantClient, asOf: Date) {
  const rows = await db.transactionLine.groupBy({
    by: ['accountId'],
    where: { transaction: { isVoided: false, date: { lte: asOf } } },
    _sum: { debit: true, credit: true },
  })

  const accounts = await db.account.findMany({
    where: { id: { in: rows.map((r) => r.accountId) } },
    orderBy: { accountNumber: 'asc' },
  })
  const byId = new Map(accounts.map((a) => [a.id, a]))

  const result = rows
    .map((row) => {
      const account = byId.get(row.accountId)!
      const debit = money(row._sum.debit?.toString() ?? 0)
      const credit = money(row._sum.credit?.toString() ?? 0)
      const net = debit.minus(credit)
      return {
        accountId: row.accountId,
        accountNumber: account.accountNumber ?? '',
        name: account.name,
        type: account.accountType,
        debit: net.greaterThan(0) ? net : ZERO,
        credit: net.lessThan(0) ? net.negated() : ZERO,
      }
    })
    .sort((a, b) => (a.accountNumber ?? '').localeCompare(b.accountNumber ?? ''))

  return {
    rows: result,
    totalDebit: sum(result.map((r) => r.debit)),
    totalCredit: sum(result.map((r) => r.credit)),
  }
}
