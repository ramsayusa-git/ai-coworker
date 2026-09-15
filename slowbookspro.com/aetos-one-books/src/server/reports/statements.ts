import 'server-only'
import { Decimal } from 'decimal.js'
import { money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { AccountType, Prisma } from '@/generated/tenant/client'
import { NORMAL_BALANCE } from '@/server/ledger'
import {
  type ColumnMode,
  type CompareMode,
  comparisonRange,
  dimensionFilter,
  monthEnd,
  monthLabel,
  monthStarts,
  quarterEnd,
  quarterLabel,
  quarterStarts,
} from './params'

/**
 * The statements: profit and loss (with monthly columns and a prior-period
 * comparison), balance sheet, cash flow, trial balance, general ledger and the
 * account register every figure drills into.
 *
 * All of it is computed from `transaction_lines`, never from the document
 * tables — an invoice that posted correctly shows up here and one that did not
 * is visibly missing, which is the point of keeping a ledger at all.
 * `financials.ts` keeps the dashboard-sized helpers; this file is the
 * full-fat reporting surface built on the same rules.
 */

export type PeriodColumn = {
  key: string
  label: string
  from: Date
  to: Date
  /** 'period' | 'total' | 'compare' | 'variance' — how the column is rendered. */
  role: 'period' | 'total' | 'compare' | 'variance' | 'variance-percent'
}

export type StatementLine = {
  accountId: number | null
  accountNumber: string
  name: string
  type: AccountType
  amounts: Record<string, Decimal>
}

type Dimensions = { classId: number | null; jobId: number | null }

const debitNormal = (type: AccountType) => NORMAL_BALANCE[type] === 'DEBIT'

function lineWhere(
  opts: { from?: Date; to: Date; types?: AccountType[]; accountId?: number } & Dimensions,
): Prisma.TransactionLineWhereInput {
  const dim = dimensionFilter(opts)
  return {
    ...(opts.accountId != null ? { accountId: opts.accountId } : {}),
    transaction: {
      isVoided: false,
      date: { ...(opts.from ? { gte: opts.from } : {}), lte: opts.to },
    },
    ...(opts.types ? { account: { accountType: { in: opts.types } } } : {}),
    ...dim,
  }
}

/** Natural-signed balance per account for one window. */
async function amountsByAccount(
  db: TenantClient,
  opts: { from?: Date; to: Date; types: AccountType[] } & Dimensions,
): Promise<Map<number, Decimal>> {
  const grouped = await db.transactionLine.groupBy({
    by: ['accountId'],
    where: lineWhere(opts),
    _sum: { debit: true, credit: true },
  })
  const accounts = await db.account.findMany({
    where: { id: { in: grouped.map((g) => g.accountId) } },
    select: { id: true, accountType: true },
  })
  const typeById = new Map(accounts.map((a) => [a.id, a.accountType]))

  const out = new Map<number, Decimal>()
  for (const group of grouped) {
    const type = typeById.get(group.accountId)
    if (!type) continue
    const debit = money(group._sum.debit?.toString() ?? 0)
    const credit = money(group._sum.credit?.toString() ?? 0)
    out.set(group.accountId, debitNormal(type) ? debit.minus(credit) : credit.minus(debit))
  }
  return out
}

async function accountsByIds(db: TenantClient, ids: number[]) {
  const accounts = await db.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, accountNumber: true, accountType: true },
  })
  return new Map(accounts.map((a) => [a.id, a]))
}

/** The column layout a P&L asks for: one total, or a column per month/quarter. */
export function statementColumns(
  from: Date,
  to: Date,
  mode: ColumnMode,
  compare: CompareMode,
): PeriodColumn[] {
  const columns: PeriodColumn[] = []

  if (mode === 'month') {
    for (const start of monthStarts(from, to)) {
      const end = monthEnd(start)
      columns.push({
        key: `m-${start.toISOString().slice(0, 7)}`,
        label: monthLabel(start),
        from: start < from ? from : start,
        to: end > to ? to : end,
        role: 'period',
      })
    }
  } else if (mode === 'quarter') {
    for (const start of quarterStarts(from, to)) {
      const end = quarterEnd(start)
      columns.push({
        key: `q-${start.toISOString().slice(0, 10)}`,
        label: quarterLabel(start),
        from: start < from ? from : start,
        to: end > to ? to : end,
        role: 'period',
      })
    }
  }

  columns.push({ key: 'total', label: 'Total', from, to, role: 'total' })

  const prior = comparisonRange(from, to, compare)
  if (prior) {
    columns.push({
      key: 'compare',
      label: compare === 'prior_year' ? 'Prior year' : 'Prior period',
      from: prior.from,
      to: prior.to,
      role: 'compare',
    })
    columns.push({ key: 'variance', label: 'Change', from, to, role: 'variance' })
    columns.push({ key: 'variance-pct', label: '% change', from, to, role: 'variance-percent' })
  }

  return columns
}

const zeroAmounts = (columns: PeriodColumn[]) =>
  Object.fromEntries(columns.map((c) => [c.key, ZERO])) as Record<string, Decimal>

function withVariance(amounts: Record<string, Decimal>, columns: PeriodColumn[]) {
  if (!columns.some((c) => c.role === 'variance')) return amounts
  const current = amounts.total ?? ZERO
  const prior = amounts.compare ?? ZERO
  const change = current.minus(prior)
  return {
    ...amounts,
    variance: change,
    'variance-pct': prior.isZero() ? ZERO : change.dividedBy(prior.abs()).times(100),
  }
}

const addAmounts = (rows: StatementLine[], columns: PeriodColumn[]) => {
  const totals = zeroAmounts(columns)
  for (const line of rows) {
    for (const column of columns) {
      totals[column.key] = (totals[column.key] ?? ZERO).plus(line.amounts[column.key] ?? ZERO)
    }
  }
  return totals
}

export type ProfitAndLoss = {
  from: Date
  to: Date
  columns: PeriodColumn[]
  income: StatementLine[]
  cogs: StatementLine[]
  expenses: StatementLine[]
  totals: {
    income: Record<string, Decimal>
    cogs: Record<string, Decimal>
    grossProfit: Record<string, Decimal>
    expenses: Record<string, Decimal>
    netIncome: Record<string, Decimal>
  }
}

/** Profit and loss over a period, optionally by month and against a prior period. */
export async function profitAndLossStatement(
  db: TenantClient,
  opts: { from: Date; to: Date; columns: ColumnMode; compare: CompareMode } & Dimensions,
): Promise<ProfitAndLoss> {
  const columns = statementColumns(opts.from, opts.to, opts.columns, opts.compare)
  const types: AccountType[] = ['INCOME', 'COGS', 'EXPENSE']

  const queried = columns.filter((c) => c.role !== 'variance' && c.role !== 'variance-percent')
  const perColumn = await Promise.all(
    queried.map((column) =>
      amountsByAccount(db, {
        from: column.from,
        to: column.to,
        types,
        classId: opts.classId,
        jobId: opts.jobId,
      }),
    ),
  )

  const ids = new Set<number>()
  for (const map of perColumn) for (const id of map.keys()) ids.add(id)
  const meta = await accountsByIds(db, [...ids])

  const lines: StatementLine[] = [...ids]
    .map((id) => {
      const account = meta.get(id)!
      const amounts = zeroAmounts(columns)
      queried.forEach((column, index) => {
        amounts[column.key] = perColumn[index].get(id) ?? ZERO
      })
      return {
        accountId: id,
        accountNumber: account.accountNumber ?? '',
        name: account.name,
        type: account.accountType,
        amounts: withVariance(amounts, columns),
      }
    })
    .filter((line) => columns.some((c) => !(line.amounts[c.key] ?? ZERO).isZero()))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber) || a.name.localeCompare(b.name))

  const income = lines.filter((l) => l.type === 'INCOME')
  const cogs = lines.filter((l) => l.type === 'COGS')
  const expenses = lines.filter((l) => l.type === 'EXPENSE')

  const totalIncome = addAmounts(income, columns)
  const totalCogs = addAmounts(cogs, columns)
  const totalExpenses = addAmounts(expenses, columns)

  const grossProfit = zeroAmounts(columns)
  const netIncome = zeroAmounts(columns)
  for (const column of columns) {
    grossProfit[column.key] = totalIncome[column.key].minus(totalCogs[column.key])
    netIncome[column.key] = grossProfit[column.key].minus(totalExpenses[column.key])
  }

  return {
    from: opts.from,
    to: opts.to,
    columns,
    income,
    cogs,
    expenses,
    totals: {
      income: withVariance(totalIncome, columns),
      cogs: withVariance(totalCogs, columns),
      grossProfit: withVariance(grossProfit, columns),
      expenses: withVariance(totalExpenses, columns),
      netIncome: withVariance(netIncome, columns),
    },
  }
}

export type BalanceSheet = {
  asOf: Date
  columns: PeriodColumn[]
  assets: StatementLine[]
  liabilities: StatementLine[]
  equity: StatementLine[]
  totals: {
    assets: Record<string, Decimal>
    liabilities: Record<string, Decimal>
    equity: Record<string, Decimal>
    liabilitiesAndEquity: Record<string, Decimal>
    outOfBalance: Record<string, Decimal>
  }
}

/**
 * Balance sheet as of a date. Income and expense are never closed to equity in
 * this ledger, so the current-period result is folded in as a synthetic equity
 * line rather than posted — the same number the P&L reports, by construction.
 */
export async function balanceSheetStatement(
  db: TenantClient,
  opts: { asOf: Date; compare: CompareMode; netIncomeLabel?: string } & Dimensions,
): Promise<BalanceSheet> {
  const prior = comparisonRange(opts.asOf, opts.asOf, opts.compare)
  const columns: PeriodColumn[] = [
    { key: 'total', label: 'Balance', from: opts.asOf, to: opts.asOf, role: 'total' },
  ]
  if (prior) {
    columns.push({
      key: 'compare',
      label: opts.compare === 'prior_year' ? 'Prior year' : 'Prior period',
      from: prior.to,
      to: prior.to,
      role: 'compare',
    })
    columns.push({ key: 'variance', label: 'Change', from: opts.asOf, to: opts.asOf, role: 'variance' })
  }

  const dates = columns.filter((c) => c.role !== 'variance').map((c) => c.to)
  const types: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY']

  const [balances, earnings] = await Promise.all([
    Promise.all(
      dates.map((date) =>
        amountsByAccount(db, { to: date, types, classId: opts.classId, jobId: opts.jobId }),
      ),
    ),
    Promise.all(
      dates.map((date) =>
        amountsByAccount(db, {
          to: date,
          types: ['INCOME', 'COGS', 'EXPENSE'],
          classId: opts.classId,
          jobId: opts.jobId,
        }),
      ),
    ),
  ])

  const ids = new Set<number>()
  for (const map of balances) for (const id of map.keys()) ids.add(id)
  const meta = await accountsByIds(db, [...ids])

  const keyed = columns.filter((c) => c.role !== 'variance')
  const lines: StatementLine[] = [...ids]
    .map((id) => {
      const account = meta.get(id)!
      const amounts = zeroAmounts(columns)
      keyed.forEach((column, index) => {
        amounts[column.key] = balances[index].get(id) ?? ZERO
      })
      return {
        accountId: id,
        accountNumber: account.accountNumber ?? '',
        name: account.name,
        type: account.accountType,
        amounts,
      }
    })
    .filter((line) => keyed.some((c) => !line.amounts[c.key].isZero()))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber) || a.name.localeCompare(b.name))

  // Income is credit-normal and cost accounts debit-normal, so each natural
  // amount is already positive in its own direction: income less costs.
  const netIncome = zeroAmounts(columns)
  const plIds = new Set<number>()
  for (const map of earnings) for (const id of map.keys()) plIds.add(id)
  const plMeta = await accountsByIds(db, [...plIds])
  keyed.forEach((column, index) => {
    let running = ZERO
    for (const [id, value] of earnings[index]) {
      const type = plMeta.get(id)?.accountType
      running = type === 'INCOME' ? running.plus(value) : running.minus(value)
    }
    netIncome[column.key] = running
  })

  const assets = lines.filter((l) => l.type === 'ASSET')
  const liabilities = lines.filter((l) => l.type === 'LIABILITY')
  const equityAccounts = lines.filter((l) => l.type === 'EQUITY')

  const equity: StatementLine[] = [...equityAccounts]
  if (keyed.some((c) => !netIncome[c.key].isZero())) {
    equity.push({
      accountId: null,
      accountNumber: '',
      name: `${opts.netIncomeLabel ?? 'Net income'} (current period)`,
      type: 'EQUITY',
      amounts: netIncome,
    })
  }

  const totalAssets = addAmounts(assets, columns)
  const totalLiabilities = addAmounts(liabilities, columns)
  const totalEquity = addAmounts(equity, columns)
  const combined = zeroAmounts(columns)
  const outOfBalance = zeroAmounts(columns)
  for (const column of columns) {
    combined[column.key] = totalLiabilities[column.key].plus(totalEquity[column.key])
    outOfBalance[column.key] = totalAssets[column.key].minus(combined[column.key])
  }

  const variance = (values: Record<string, Decimal>) =>
    columns.some((c) => c.role === 'variance')
      ? { ...values, variance: values.total.minus(values.compare ?? ZERO) }
      : values

  return {
    asOf: opts.asOf,
    columns,
    assets: assets.map((l) => ({ ...l, amounts: variance(l.amounts) })),
    liabilities: liabilities.map((l) => ({ ...l, amounts: variance(l.amounts) })),
    equity: equity.map((l) => ({ ...l, amounts: variance(l.amounts) })),
    totals: {
      assets: variance(totalAssets),
      liabilities: variance(totalLiabilities),
      equity: variance(totalEquity),
      liabilitiesAndEquity: variance(combined),
      outOfBalance: variance(outOfBalance),
    },
  }
}

/**
 * Which activity an account belongs to. Working capital — receivables,
 * inventory, payables, accrued tax — is operating even though the accounts are
 * assets and liabilities; long-lived assets are investing and long-term debt
 * and equity are financing. The account number decides, with the type as the
 * fallback for a chart that does not number its accounts.
 */
export function cashFlowSection(
  type: AccountType,
  accountNumber: string,
): 'operating' | 'investing' | 'financing' {
  const number = Number.parseInt(accountNumber, 10)
  if (type === 'ASSET') {
    if (!Number.isFinite(number)) return 'investing'
    return number < 1500 ? 'operating' : 'investing'
  }
  if (type === 'LIABILITY') {
    if (!Number.isFinite(number)) return 'financing'
    return number < 2500 ? 'operating' : 'financing'
  }
  if (type === 'EQUITY') return 'financing'
  return 'operating'
}

export type CashFlowRow = {
  accountId: number
  accountNumber: string
  name: string
  amount: Decimal
}

export type CashFlowStatement = {
  from: Date
  to: Date
  operating: CashFlowRow[]
  investing: CashFlowRow[]
  financing: CashFlowRow[]
  totalOperating: Decimal
  totalInvesting: Decimal
  totalFinancing: Decimal
  netChange: Decimal
  openingCash: Decimal
  closingCash: Decimal
}

/**
 * Cash flow, indirect: take every journal that touched a bank account in the
 * period and report the *other* side of it, grouped by what that side was.
 * Opening balances are excluded — they are not a movement of cash, they are
 * where the cash came in.
 */
export async function cashFlowStatement(
  db: TenantClient,
  opts: { from: Date; to: Date } & Dimensions,
): Promise<CashFlowStatement> {
  const cashAccounts = await db.account.findMany({
    where: { bankKind: 'bank' },
    select: { id: true },
  })
  const cashIds = cashAccounts.map((a) => a.id)

  if (cashIds.length === 0) {
    return {
      from: opts.from,
      to: opts.to,
      operating: [],
      investing: [],
      financing: [],
      totalOperating: ZERO,
      totalInvesting: ZERO,
      totalFinancing: ZERO,
      netChange: ZERO,
      openingCash: ZERO,
      closingCash: ZERO,
    }
  }

  const cashLines = await db.transactionLine.findMany({
    where: {
      accountId: { in: cashIds },
      transaction: { isVoided: false, date: { gte: opts.from, lte: opts.to } },
    },
    select: { transactionId: true },
  })
  const transactionIds = [...new Set(cashLines.map((l) => l.transactionId))]

  const grouped = transactionIds.length
    ? await db.transactionLine.groupBy({
        by: ['accountId'],
        where: {
          transactionId: { in: transactionIds },
          accountId: { notIn: cashIds },
          transaction: { isVoided: false, date: { gte: opts.from, lte: opts.to } },
          ...dimensionFilter(opts),
        },
        _sum: { debit: true, credit: true },
      })
    : []

  const meta = await accountsByIds(db, grouped.map((g) => g.accountId))

  const rows = grouped
    .map((group) => {
      const account = meta.get(group.accountId)!
      const debit = money(group._sum.debit?.toString() ?? 0)
      const credit = money(group._sum.credit?.toString() ?? 0)
      return {
        accountId: group.accountId,
        accountNumber: account.accountNumber ?? '',
        name: account.name,
        type: account.accountType,
        // Credit on the non-cash side means cash came in.
        amount: credit.minus(debit),
      }
    })
    .filter((r) => !r.amount.isZero())
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))

  const operating = rows.filter((r) => cashFlowSection(r.type, r.accountNumber) === 'operating')
  const investing = rows.filter((r) => cashFlowSection(r.type, r.accountNumber) === 'investing')
  const financing = rows.filter((r) => cashFlowSection(r.type, r.accountNumber) === 'financing')

  const cashAt = async (date: Date) => {
    const totals = await db.transactionLine.aggregate({
      where: {
        accountId: { in: cashIds },
        transaction: { isVoided: false, date: { lte: date } },
      },
      _sum: { debit: true, credit: true },
    })
    return money(totals._sum.debit?.toString() ?? 0).minus(money(totals._sum.credit?.toString() ?? 0))
  }

  const dayBefore = new Date(opts.from.getTime() - 86_400_000)
  const [openingCash, closingCash] = await Promise.all([cashAt(dayBefore), cashAt(opts.to)])

  const totalOperating = sum(operating.map((r) => r.amount))
  const totalInvesting = sum(investing.map((r) => r.amount))
  const totalFinancing = sum(financing.map((r) => r.amount))

  const strip = ({ accountId, accountNumber, name, amount }: (typeof rows)[number]) => ({
    accountId,
    accountNumber,
    name,
    amount,
  })

  return {
    from: opts.from,
    to: opts.to,
    operating: operating.map(strip),
    investing: investing.map(strip),
    financing: financing.map(strip),
    totalOperating,
    totalInvesting,
    totalFinancing,
    netChange: totalOperating.plus(totalInvesting).plus(totalFinancing),
    openingCash,
    closingCash,
  }
}

export type TrialBalanceRow = {
  accountId: number
  accountNumber: string
  name: string
  type: AccountType
  debit: Decimal
  credit: Decimal
}

/** Trial balance for a window: raw debit and credit totals, and the difference. */
export async function trialBalanceReport(
  db: TenantClient,
  opts: { from?: Date; to: Date } & Dimensions,
) {
  const grouped = await db.transactionLine.groupBy({
    by: ['accountId'],
    where: lineWhere(opts),
    _sum: { debit: true, credit: true },
  })
  const meta = await accountsByIds(db, grouped.map((g) => g.accountId))

  const rows: TrialBalanceRow[] = grouped
    .map((group) => {
      const account = meta.get(group.accountId)!
      const debit = money(group._sum.debit?.toString() ?? 0)
      const credit = money(group._sum.credit?.toString() ?? 0)
      const net = debit.minus(credit)
      return {
        accountId: group.accountId,
        accountNumber: account.accountNumber ?? '',
        name: account.name,
        type: account.accountType,
        debit: net.greaterThan(0) ? net : ZERO,
        credit: net.lessThan(0) ? net.negated() : ZERO,
      }
    })
    .filter((r) => !r.debit.isZero() || !r.credit.isZero())
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber) || a.name.localeCompare(b.name))

  const totalDebit = sum(rows.map((r) => r.debit))
  const totalCredit = sum(rows.map((r) => r.credit))

  return { rows, totalDebit, totalCredit, difference: totalDebit.minus(totalCredit) }
}

export type LedgerEntry = {
  lineId: number
  transactionId: number
  date: Date
  reference: string
  description: string
  debit: Decimal
  credit: Decimal
  balance: Decimal
}

export type LedgerAccount = {
  accountId: number
  accountNumber: string
  name: string
  type: AccountType
  opening: Decimal
  entries: LedgerEntry[]
  totalDebit: Decimal
  totalCredit: Decimal
  closing: Decimal
}

/** General ledger: every account with activity, each with its running balance. */
export async function generalLedger(
  db: TenantClient,
  opts: { from: Date; to: Date; accountId?: number | null } & Dimensions,
): Promise<LedgerAccount[]> {
  const lines = await db.transactionLine.findMany({
    where: lineWhere({
      from: opts.from,
      to: opts.to,
      classId: opts.classId,
      jobId: opts.jobId,
      ...(opts.accountId ? { accountId: opts.accountId } : {}),
    }),
    select: {
      id: true,
      accountId: true,
      debit: true,
      credit: true,
      description: true,
      transaction: { select: { id: true, date: true, reference: true, description: true } },
      account: { select: { id: true, name: true, accountNumber: true, accountType: true } },
    },
    orderBy: [{ transaction: { date: 'asc' } }, { transactionId: 'asc' }, { id: 'asc' }],
    take: 5000,
  })

  const openings = await Promise.all(
    [...new Set(lines.map((l) => l.accountId))].map(async (accountId) => {
      const totals = await db.transactionLine.aggregate({
        where: {
          accountId,
          transaction: { isVoided: false, date: { lt: opts.from } },
          ...dimensionFilter(opts),
        },
        _sum: { debit: true, credit: true },
      })
      return [accountId, totals] as const
    }),
  )
  const openingByAccount = new Map(openings)

  const byAccount = new Map<number, LedgerAccount>()
  for (const line of lines) {
    let bucket = byAccount.get(line.accountId)
    if (!bucket) {
      const totals = openingByAccount.get(line.accountId)
      const debit = money(totals?._sum.debit?.toString() ?? 0)
      const credit = money(totals?._sum.credit?.toString() ?? 0)
      const opening = debitNormal(line.account.accountType)
        ? debit.minus(credit)
        : credit.minus(debit)
      bucket = {
        accountId: line.accountId,
        accountNumber: line.account.accountNumber ?? '',
        name: line.account.name,
        type: line.account.accountType,
        opening,
        entries: [],
        totalDebit: ZERO,
        totalCredit: ZERO,
        closing: opening,
      }
      byAccount.set(line.accountId, bucket)
    }

    const debit = money(line.debit.toString())
    const credit = money(line.credit.toString())
    const delta = debitNormal(bucket.type) ? debit.minus(credit) : credit.minus(debit)
    bucket.closing = bucket.closing.plus(delta)
    bucket.totalDebit = bucket.totalDebit.plus(debit)
    bucket.totalCredit = bucket.totalCredit.plus(credit)
    bucket.entries.push({
      lineId: line.id,
      transactionId: line.transaction.id,
      date: line.transaction.date,
      reference: line.transaction.reference ?? '',
      description: line.transaction.description ?? line.description ?? '',
      debit,
      credit,
      balance: bucket.closing,
    })
  }

  return [...byAccount.values()].sort(
    (a, b) => a.accountNumber.localeCompare(b.accountNumber) || a.name.localeCompare(b.name),
  )
}

export type RegisterEntry = {
  lineId: number
  transactionId: number
  date: Date
  description: string
  reference: string
  sourceType: string
  sourceId: number | null
  debit: Decimal
  credit: Decimal
  balance: Decimal
  cleared: boolean
}

export type AccountRegister = {
  account: {
    id: number
    accountNumber: string
    name: string
    type: AccountType
    bankKind: string | null
    normalBalance: 'debit' | 'credit'
  }
  from: Date
  to: Date
  opening: Decimal
  periodDebit: Decimal
  periodCredit: Decimal
  periodNet: Decimal
  closing: Decimal
  entries: RegisterEntry[]
  truncated: boolean
}

const REGISTER_LIMIT = 500

/**
 * The account register — the drill-down every figure on every statement links
 * to. Opening balance, then one line per split with a running balance, in
 * posting order.
 */
export async function accountRegister(
  db: TenantClient,
  opts: { accountId: number; from: Date; to: Date; page?: number } & Dimensions,
): Promise<AccountRegister | null> {
  const account = await db.account.findUnique({
    where: { id: opts.accountId },
    select: { id: true, name: true, accountNumber: true, accountType: true, bankKind: true },
  })
  if (!account) return null

  const isDebitNormal = debitNormal(account.accountType)

  const openingTotals = await db.transactionLine.aggregate({
    where: {
      accountId: opts.accountId,
      transaction: { isVoided: false, date: { lt: opts.from } },
      ...dimensionFilter(opts),
    },
    _sum: { debit: true, credit: true },
  })
  const openingDebit = money(openingTotals._sum.debit?.toString() ?? 0)
  const openingCredit = money(openingTotals._sum.credit?.toString() ?? 0)
  const opening = isDebitNormal
    ? openingDebit.minus(openingCredit)
    : openingCredit.minus(openingDebit)

  const where = lineWhere({
    accountId: opts.accountId,
    from: opts.from,
    to: opts.to,
    classId: opts.classId,
    jobId: opts.jobId,
  })

  const [lines, total] = await Promise.all([
    db.transactionLine.findMany({
      where,
      select: {
        id: true,
        debit: true,
        credit: true,
        description: true,
        cleared: true,
        transaction: {
          select: {
            id: true,
            date: true,
            reference: true,
            description: true,
            sourceType: true,
            sourceId: true,
          },
        },
      },
      orderBy: [{ transaction: { date: 'asc' } }, { transactionId: 'asc' }, { id: 'asc' }],
      take: REGISTER_LIMIT,
    }),
    db.transactionLine.count({ where }),
  ])

  let balance = opening
  let periodDebit = ZERO
  let periodCredit = ZERO
  const entries: RegisterEntry[] = lines.map((line) => {
    const debit = money(line.debit.toString())
    const credit = money(line.credit.toString())
    periodDebit = periodDebit.plus(debit)
    periodCredit = periodCredit.plus(credit)
    balance = balance.plus(isDebitNormal ? debit.minus(credit) : credit.minus(debit))
    return {
      lineId: line.id,
      transactionId: line.transaction.id,
      date: line.transaction.date,
      description: line.transaction.description ?? line.description ?? '',
      reference: line.transaction.reference ?? '',
      sourceType: line.transaction.sourceType ?? 'journal',
      sourceId: line.transaction.sourceId,
      debit,
      credit,
      balance,
      cleared: line.cleared,
    }
  })

  return {
    account: {
      id: account.id,
      accountNumber: account.accountNumber ?? '',
      name: account.name,
      type: account.accountType,
      bankKind: account.bankKind,
      normalBalance: isDebitNormal ? 'debit' : 'credit',
    },
    from: opts.from,
    to: opts.to,
    opening,
    periodDebit,
    periodCredit,
    periodNet: isDebitNormal ? periodDebit.minus(periodCredit) : periodCredit.minus(periodDebit),
    closing: balance,
    entries,
    truncated: total > lines.length,
  }
}

/** Where a posted document lives, so a register line can link back to it. */
export function sourceHref(sourceType: string, sourceId: number | null): string | null {
  if (!sourceId) return null
  const map: Record<string, string> = {
    invoice: '/invoices',
    sales_receipt: '/invoices',
    payment: '/payments',
    credit_memo: '/credit-memos',
    bill: '/bills',
    bill_payment: '/bill-payments',
    vendor_credit: '/vendor-credits',
    expense: '/expenses',
    deposit: '/deposits',
    transfer: '/transfers',
    journal: '/journal',
    manual_journal: '/journal',
  }
  const base = map[sourceType]
  return base ? `${base}/${sourceId}` : null
}

/** Classes and jobs for the report shell's filter row. */
export async function reportDimensions(db: TenantClient) {
  const [classes, jobs] = await Promise.all([
    db.trackingClass.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.job.findMany({
      where: { isActive: true },
      select: { id: true, name: true, customer: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ])
  return {
    classes,
    jobs: jobs.map((job) => ({ id: job.id, name: `${job.customer.name}: ${job.name}` })),
  }
}
