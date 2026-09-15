import 'server-only'
import { Decimal } from 'decimal.js'
import { cents, money, sum, ZERO } from '@/lib/money'
import { sha256 } from '@/lib/crypto'
import type { TenantClient } from '@/lib/tenant-db'
import type {
  Account,
  BankAccount,
  BankCsvFormat,
  BankTransaction,
  ImportChannel,
  Prisma,
  Transaction,
  TransactionLine,
} from '@/generated/tenant/client'
import { postJournalEntry, reverseTransaction, assertPostable } from './ledger'
import { CONTROL_ACCOUNTS, controlAccountId } from './seed-tenant'
import {
  DomainError,
  glBalance,
  glBalances,
  isDebitNormal,
  requireBankLedgerAccount,
} from './accounts'

/**
 * Banking — and the rule the whole module turns on: **the bank register IS the
 * general ledger**. A bank or card account is a chart-of-accounts row with
 * `bankKind` set; `bank_accounts` is only the statement identity (the feed)
 * for that ledger account. No balance is ever stored. Nothing posts silently:
 * an imported statement line sits in the review queue until a person matches
 * it, adds it or excludes it.
 *
 * The sign contract, once, for everything below: an amount **> 0 debits** the
 * bank/card ledger account, **< 0 credits** it — the same for an asset and for
 * a liability. Statements already carry amounts that way, so nothing is
 * flipped on import.
 */

export { DomainError }

const AUTO_WINDOW_DAYS = 5
const CANDIDATE_WINDOW_DAYS = 30
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024

// ---------------------------------------------------------------------------
// Dates and money
// ---------------------------------------------------------------------------

/** Postgres `date` columns are naive — keep every comparison at UTC midnight. */
export function utcDate(value: Date | string): Date {
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export const isoDate = (value: Date): string => value.toISOString().slice(0, 10)

const addDays = (value: Date, days: number) =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000)

const daysBetween = (a: Date, b: Date) =>
  Math.round(Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))

/** Natural-signed movement of one ledger line on its account. */
const naturalAmount = (line: { debit: Prisma.Decimal; credit: Prisma.Decimal }, debitNormal: boolean) => {
  const dr = money(line.debit.toString())
  const cr = money(line.credit.toString())
  return debitNormal ? dr.minus(cr) : cr.minus(dr)
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export type RegisterEntry = {
  lineId: number
  transactionId: number
  date: Date
  description: string
  payee: string
  reference: string
  debit: Decimal
  credit: Decimal
  /** Natural-signed delta this line applies to the account. */
  amount: Decimal
  runningBalance: Decimal
  sourceType: string
  sourceId: number | null
  cleared: boolean
  reconciliationId: number | null
  voided: boolean
  /** Only entries this module created can be voided from the register. */
  voidable: boolean
}

export type Register = {
  account: Account
  naturalBalance: 'debit' | 'credit'
  openingBalance: Decimal
  periodDebit: Decimal
  periodCredit: Decimal
  periodNet: Decimal
  balance: Decimal
  entries: RegisterEntry[]
}

const VOIDABLE_SOURCES = new Set(['bank_entry', 'transfer', 'cc_charge', 'deposit', 'manual'])

/**
 * Counterparty names, resolved in batch. An expense, a bill payment and a
 * customer payment each know their own party; everything else falls back to
 * the header description.
 */
async function payeesFor(db: TenantClient, transactions: Transaction[]) {
  const out = new Map<number, string>()
  const billPaymentIds: number[] = []
  const paymentIds: number[] = []

  for (const txn of transactions) {
    if (txn.sourceId) {
      if (txn.sourceType === 'bill_payment') billPaymentIds.push(txn.sourceId)
      if (txn.sourceType === 'payment') paymentIds.push(txn.sourceId)
    }
  }

  const [billPayments, payments] = await Promise.all([
    billPaymentIds.length
      ? db.billPayment.findMany({
          where: { id: { in: billPaymentIds } },
          select: { id: true, vendor: { select: { name: true } } },
        })
      : Promise.resolve([]),
    paymentIds.length
      ? db.payment.findMany({
          where: { id: { in: paymentIds } },
          select: { id: true, customer: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ])

  const vendorByPayment = new Map(billPayments.map((p) => [p.id, p.vendor?.name ?? '']))
  const customerByPayment = new Map(payments.map((p) => [p.id, p.customer?.name ?? '']))

  for (const txn of transactions) {
    const fallback = (txn.description ?? '')
      .replace(/^Expense: /, '')
      .replace(/^CC Charge: /, '')
      .trim()
    if (txn.sourceType === 'bill_payment' && txn.sourceId) {
      out.set(txn.id, vendorByPayment.get(txn.sourceId) || fallback)
    } else if (txn.sourceType === 'payment' && txn.sourceId) {
      out.set(txn.id, customerByPayment.get(txn.sourceId) || fallback)
    } else {
      out.set(txn.id, fallback)
    }
  }
  return out
}

/**
 * Every posting that touches the account, in date order, with a running
 * balance. Expenses, deposits, bill payments, payroll, card charges, transfers
 * and journal entries all appear — a register that hid any of them would not
 * be the ledger.
 */
export async function accountRegister(
  db: TenantClient,
  accountId: number,
  opts: { start?: Date; end?: Date } = {},
): Promise<Register> {
  const account = await db.account.findUnique({ where: { id: accountId } })
  if (!account) throw new DomainError('Account not found.', 404)
  const debitNormal = isDebitNormal(account.accountType)

  let opening = ZERO
  if (opts.start) {
    const before = await db.transactionLine.aggregate({
      where: {
        accountId,
        transaction: { isVoided: false, date: { lt: opts.start } },
      },
      _sum: { debit: true, credit: true },
    })
    const dr = money(before._sum.debit?.toString() ?? 0)
    const cr = money(before._sum.credit?.toString() ?? 0)
    opening = debitNormal ? dr.minus(cr) : cr.minus(dr)
  }

  const lines = await db.transactionLine.findMany({
    where: {
      accountId,
      transaction: {
        ...(opts.start ? { date: { gte: opts.start } } : {}),
        ...(opts.end ? { date: { lte: opts.end } } : {}),
      },
    },
    include: { transaction: true },
    orderBy: [{ transaction: { date: 'asc' } }, { transactionId: 'asc' }, { id: 'asc' }],
  })

  const payees = await payeesFor(db, lines.map((l) => l.transaction))

  let running = opening
  let periodDebit = ZERO
  let periodCredit = ZERO
  const entries: RegisterEntry[] = []

  for (const line of lines) {
    const txn = line.transaction
    const debit = money(line.debit.toString())
    const credit = money(line.credit.toString())
    const delta = naturalAmount(line, debitNormal)

    // A voided posting stays visible — with its reversal — but it does not
    // move the running balance twice, because the reversal is its own row.
    running = running.plus(delta)
    periodDebit = periodDebit.plus(debit)
    periodCredit = periodCredit.plus(credit)

    entries.push({
      lineId: line.id,
      transactionId: txn.id,
      date: txn.date,
      description: txn.description || line.description || '',
      payee: payees.get(txn.id) ?? '',
      reference: txn.reference ?? '',
      debit,
      credit,
      amount: delta,
      runningBalance: running,
      sourceType: txn.sourceType ?? 'journal',
      sourceId: txn.sourceId,
      cleared: line.cleared,
      reconciliationId: line.reconciliationId,
      voided: txn.isVoided,
      voidable:
        VOIDABLE_SOURCES.has(txn.sourceType ?? '') && !txn.isVoided && line.reconciliationId === null,
    })
  }

  const periodNet = debitNormal
    ? periodDebit.minus(periodCredit)
    : periodCredit.minus(periodDebit)

  return {
    account,
    naturalBalance: debitNormal ? 'debit' : 'credit',
    openingBalance: opening,
    periodDebit,
    periodCredit,
    periodNet,
    balance: await glBalance(db, accountId),
    entries,
  }
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

type Tx = TenantClient | Prisma.TransactionClient

/** Opening balance against Opening Balance Equity — never a plug elsewhere. */
export async function postOpeningBalance(
  db: TenantClient,
  accountId: number,
  date: Date,
  amount: Decimal.Value,
) {
  const account = await requireBankLedgerAccount(db, accountId)
  const value = cents(amount)
  if (value.isZero()) throw new DomainError('An opening balance of zero is nothing to post.')

  const obeId = await controlAccountId(db, CONTROL_ACCOUNTS.OPENING_BALANCE_EQUITY)
  const bankDebit = isDebitNormal(account.accountType) ? value : value.negated()
  const magnitude = bankDebit.abs()

  return postJournalEntry(db, {
    date: utcDate(date),
    description: `Opening balance: ${account.name}`,
    reference: '',
    sourceType: 'opening_balance',
    lines: bankDebit.isPositive()
      ? [
          { accountId: account.id, debit: magnitude },
          { accountId: obeId, credit: magnitude },
        ]
      : [
          { accountId: obeId, debit: magnitude },
          { accountId: account.id, credit: magnitude },
        ],
  })
}

/** Money between two of your own bank/card accounts — one entry, two bank lines. */
export async function postTransfer(
  tx: Tx,
  input: {
    date: Date
    fromAccount: Account
    toAccount: Account
    amount: Decimal.Value
    memo?: string | null
    reference?: string | null
  },
) {
  const amount = cents(input.amount)
  if (amount.lessThanOrEqualTo(0)) throw new DomainError('A transfer amount must be positive.')
  if (input.fromAccount.id === input.toAccount.id) {
    throw new DomainError('A transfer needs two different accounts.')
  }
  for (const account of [input.fromAccount, input.toAccount]) {
    if (!account.bankKind) {
      throw new DomainError(`${account.name} is not a bank or credit-card account.`)
    }
  }

  const memo = input.memo?.trim()
  const description =
    `Transfer: ${input.fromAccount.name} → ${input.toAccount.name}` + (memo ? ` — ${memo}` : '')

  return postJournalEntry(tx, {
    date: utcDate(input.date),
    description,
    reference: input.reference ?? '',
    sourceType: 'transfer',
    lines: [
      { accountId: input.toAccount.id, debit: amount, description: memo || null },
      { accountId: input.fromAccount.id, credit: amount, description: memo || null },
    ],
  })
}

/**
 * The two-sided entry behind a register row and behind "add" on a feed line.
 * A category that is itself a bank or card account is a transfer, which is how
 * a card payment gets recorded by adding the statement line.
 */
export async function postBankEntry(
  tx: Tx,
  input: {
    account: Account
    category: Account
    date: Date
    amount: Decimal.Value
    payee?: string | null
    memo?: string | null
    reference?: string | null
    classId?: number | null
    jobId?: number | null
    sourceId?: number | null
  },
) {
  const amount = cents(input.amount)
  if (amount.isZero()) throw new DomainError('A register entry needs an amount.')
  if (input.category.id === input.account.id) {
    throw new DomainError('The category must be a different account from the bank account.')
  }

  if (input.category.bankKind) {
    return amount.isNegative()
      ? postTransfer(tx, {
          date: input.date,
          fromAccount: input.account,
          toAccount: input.category,
          amount: amount.negated(),
          memo: input.memo,
          reference: input.reference,
        })
      : postTransfer(tx, {
          date: input.date,
          fromAccount: input.category,
          toAccount: input.account,
          amount,
          memo: input.memo,
          reference: input.reference,
        })
  }

  const lineDescription = input.memo || input.payee || null
  const magnitude = amount.abs()

  return postJournalEntry(tx, {
    date: utcDate(input.date),
    description: input.payee || input.memo || 'Bank entry',
    reference: input.reference ?? '',
    sourceType: 'bank_entry',
    sourceId: input.sourceId ?? null,
    classId: input.classId ?? null,
    jobId: input.jobId ?? null,
    lines: amount.isNegative()
      ? [
          { accountId: input.category.id, debit: magnitude, description: lineDescription },
          { accountId: input.account.id, credit: magnitude, description: lineDescription },
        ]
      : [
          { accountId: input.account.id, debit: magnitude, description: lineDescription },
          { accountId: input.category.id, credit: magnitude, description: lineDescription },
        ],
  })
}

/** A completed reconciliation is a closed month — its lines cannot be undone. */
export async function assertNotReconciled(db: Tx, transactionId: number) {
  const stamped = await (db as TenantClient).transactionLine.count({
    where: { transactionId, reconciliationId: { not: null } },
  })
  if (stamped > 0) {
    throw new DomainError(
      'This entry is in a completed reconciliation and cannot be voided. Undo the reconciliation first, or post a correcting entry.',
    )
  }
}

/**
 * Hand every statement line that pointed at this posting back to the review
 * queue, and un-tick every line it cleared. The statement facts survive the
 * void; the links do not.
 */
export async function releaseStatementLinks(db: Tx, transactionId: number) {
  const client = db as TenantClient
  const lines = await client.transactionLine.findMany({
    where: { transactionId },
    select: { id: true },
  })
  const lineIds = lines.map((l) => l.id)

  const released = await client.bankTransaction.updateMany({
    where: { transactionLineId: { in: lineIds } },
    data: { transactionId: null, transactionLineId: null, matchStatus: 'UNMATCHED' },
  })
  await client.transactionLine.updateMany({
    where: { transactionId },
    data: { cleared: false },
  })
  return released.count
}

/**
 * Void by reversal (never an update, never a delete): the reversing entry is
 * posted by the ledger, then the statement links are released so the feed
 * lines come back for review.
 */
export async function voidPosting(db: TenantClient, transactionId: number) {
  const txn = await db.transaction.findUnique({ where: { id: transactionId } })
  if (!txn) throw new DomainError('Entry not found.', 404)
  if (txn.isVoided) throw new DomainError('This entry is already void.')
  await assertNotReconciled(db, transactionId)

  return db.$transaction(async (tx) => {
    const client = tx as unknown as TenantClient
    const reversal = await reverseTransaction(client, transactionId, {
      description: `VOID: ${txn.description ?? `#${txn.id}`}`,
    })
    await releaseStatementLinks(client, transactionId)
    return reversal
  })
}

// ---------------------------------------------------------------------------
// Feeds and the banking overview
// ---------------------------------------------------------------------------

export type BankingOverviewRow = {
  accountId: number
  accountNumber: string | null
  name: string
  bankKind: string
  balance: Decimal
  toReview: number
  lastReconciled: Date | null
  feed: (BankAccount & { balance: Decimal }) | null
}

export async function bankingOverview(db: TenantClient): Promise<BankingOverviewRow[]> {
  const accounts = await db.account.findMany({
    where: { bankKind: { not: null }, isActive: true },
    orderBy: [{ accountNumber: 'asc' }, { name: 'asc' }],
  })
  if (accounts.length === 0) return []

  const ids = accounts.map((a) => a.id)
  const [balances, feeds, recons] = await Promise.all([
    glBalances(db, ids),
    db.bankAccount.findMany({ where: { accountId: { in: ids }, isActive: true } }),
    db.reconciliation.findMany({
      where: { accountId: { in: ids }, status: 'COMPLETED' },
      orderBy: { statementDate: 'asc' },
      select: { accountId: true, statementDate: true },
    }),
  ])

  const feedByAccount = new Map(feeds.map((f) => [f.accountId ?? -1, f]))
  const reconByAccount = new Map<number, Date>()
  for (const row of recons) if (row.accountId) reconByAccount.set(row.accountId, row.statementDate)

  const counts = feeds.length
    ? await db.bankTransaction.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: feeds.map((f) => f.id) }, matchStatus: 'UNMATCHED' },
        _count: { _all: true },
      })
    : []
  const toReviewByFeed = new Map(counts.map((c) => [c.bankAccountId, c._count._all]))

  return accounts.map((account) => {
    const feed = feedByAccount.get(account.id) ?? null
    const balance = balances.get(account.id) ?? ZERO
    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      name: account.name,
      bankKind: account.bankKind!,
      balance,
      toReview: feed ? (toReviewByFeed.get(feed.id) ?? 0) : 0,
      lastReconciled: reconByAccount.get(account.id) ?? null,
      feed: feed ? { ...feed, balance } : null,
    }
  })
}

/** At most one active feed per ledger account — a second one would double-count. */
async function rejectSecondFeed(db: TenantClient, accountId: number, exceptId?: number) {
  const other = await db.bankAccount.findFirst({
    where: { accountId, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
  })
  if (other) {
    throw new DomainError(`"${other.name}" is already the feed for this ledger account.`, 409)
  }
}

export async function createFeed(
  db: TenantClient,
  input: {
    name: string
    accountId: number
    bankName?: string | null
    lastFour?: string | null
    openingBalance?: Decimal.Value
    openingDate?: Date | null
  },
) {
  await requireBankLedgerAccount(db, input.accountId)
  await rejectSecondFeed(db, input.accountId)

  const opening = cents(input.openingBalance ?? 0)
  if (!opening.isZero()) {
    await postOpeningBalance(db, input.accountId, input.openingDate ?? new Date(), opening)
  }

  return db.bankAccount.create({
    data: {
      name: input.name.trim(),
      accountId: input.accountId,
      bankName: input.bankName?.trim() || null,
      lastFour: input.lastFour?.trim() || null,
      legacyBalance: null,
    },
  })
}

export async function updateFeed(
  db: TenantClient,
  id: number,
  patch: { name?: string; accountId?: number; bankName?: string | null; lastFour?: string | null; isActive?: boolean },
) {
  const feed = await db.bankAccount.findUnique({ where: { id } })
  if (!feed) throw new DomainError('Bank feed not found.', 404)

  if (patch.accountId !== undefined && patch.accountId !== feed.accountId) {
    const linked = await db.bankTransaction.count({
      where: { bankAccountId: id, transactionLineId: { not: null } },
    })
    if (linked > 0) {
      throw new DomainError(
        'This feed already has matched statement lines; its ledger account cannot change.',
      )
    }
    await requireBankLedgerAccount(db, patch.accountId)
    await rejectSecondFeed(db, patch.accountId, id)
  }

  return db.bankAccount.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
      ...(patch.bankName !== undefined ? { bankName: patch.bankName?.trim() || null } : {}),
      ...(patch.lastFour !== undefined ? { lastFour: patch.lastFour?.trim() || null } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  })
}

/** The feed's ledger account, or a message saying exactly what to fix. */
export async function feedAccount(db: TenantClient, feed: BankAccount): Promise<Account> {
  if (!feed.accountId) {
    throw new DomainError('Link this feed to a ledger account first.')
  }
  return requireBankLedgerAccount(db, feed.accountId)
}

// ---------------------------------------------------------------------------
// Import — parsing
// ---------------------------------------------------------------------------

export type ParsedRow = {
  fitid?: string
  date: Date
  amount: Decimal
  payee: string
  description: string
  checkNumber?: string | null
  fee?: Decimal | null
  importId?: string
}

/** Try the formats a bank export actually uses, in the order they collide least. */
export function parseStatementDate(value: string): Date {
  const raw = value.trim()
  if (!raw) throw new DomainError(`Cannot read the date "${value}".`)

  const patterns: Array<[RegExp, (m: RegExpMatchArray) => [number, number, number]]> = [
    [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => [Number(m[3]), Number(m[1]), Number(m[2])]],
    [/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (m) => [Number(m[1]), Number(m[2]), Number(m[3])]],
    [/^(\d{1,2})-(\d{1,2})-(\d{4})$/, (m) => [Number(m[3]), Number(m[1]), Number(m[2])]],
  ]
  for (const [pattern, pick] of patterns) {
    const match = raw.match(pattern)
    if (match) {
      const [y, m, d] = pick(match)
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d))
    }
  }
  // Last resort: a date-time string the exporter wrote in ISO-ish form.
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return utcDate(parsed)
  throw new DomainError(`Cannot read the date "${value}".`)
}

function parseAmount(value: string): Decimal {
  const cleaned = value.trim().replace(/[$,\s]/g, '')
  if (!cleaned) throw new DomainError('Cannot read a blank amount.')
  const negated = /^\(.*\)$/.test(cleaned) ? `-${cleaned.slice(1, -1)}` : cleaned
  const parsed = new Decimal(negated)
  if (!parsed.isFinite()) throw new DomainError(`Cannot read the amount "${value}".`)
  return cents(parsed)
}

/**
 * OFX/QFX. The container is SGML-ish rather than XML, so this reads the
 * `<STMTTRN>` blocks directly — which also means a QFX with Intuit's extra
 * headers parses exactly like a plain OFX.
 */
export function parseOfx(content: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const blocks = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? []

  for (const block of blocks) {
    const tag = (name: string) => {
      const match = block.match(new RegExp(`<${name}>([^<\\n\\r]+)`, 'i'))
      return match ? match[1]!.trim() : ''
    }
    const posted = tag('DTPOSTED')
    const amount = tag('TRNAMT')
    if (!posted || !amount) continue

    const year = Number(posted.slice(0, 4))
    const month = Number(posted.slice(4, 6))
    const day = Number(posted.slice(6, 8))
    if (!year || !month || !day) continue

    const name = tag('NAME')
    const memo = tag('MEMO')
    rows.push({
      fitid: tag('FITID'),
      date: new Date(Date.UTC(year, month - 1, day)),
      amount: cents(new Decimal(amount)),
      payee: name || memo,
      description: memo,
      checkNumber: tag('CHECKNUM') || null,
    })
  }
  return rows
}

/** RFC4180-ish single-line split: quotes, doubled quotes, embedded commas. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells.map((c) => c.trim())
}

const CSV_SIGNATURES: Array<{ format: BankCsvFormat; columns: string[] }> = [
  {
    format: 'CHASE_CHECKING',
    columns: ['Details', 'Posting Date', 'Description', 'Amount', 'Type'],
  },
  {
    format: 'CHASE_CREDIT',
    columns: ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount'],
  },
  { format: 'PAYPAL', columns: ['Date', 'Time', 'Name', 'Type', 'Status'] },
  {
    format: 'PAYPAL_NEW',
    columns: [
      'Date', 'Time', 'Description', 'Gross', 'Fee', 'Net',
      'Transaction ID', 'From Email Address', 'Name',
    ],
  },
  { format: 'BOFA_DETAIL', columns: ['Date', 'Description', 'Amount', 'Running Bal.'] },
]

/** Detection is by columns, never by filename — people rename exports. */
export function detectCsvFormat(headers: Set<string>): BankCsvFormat {
  for (const signature of CSV_SIGNATURES) {
    if (signature.columns.every((column) => headers.has(column))) return signature.format
  }
  return 'UNKNOWN'
}

export const CSV_FORMAT_LABEL: Record<BankCsvFormat, string> = {
  CHASE_CHECKING: 'Chase checking',
  CHASE_CREDIT: 'Chase credit card',
  PAYPAL: 'PayPal (classic)',
  PAYPAL_NEW: 'PayPal (2026)',
  BOFA_DETAIL: 'Bank of America',
  UNKNOWN: 'Unrecognised',
}

/** Bank of America writes about eight preamble lines above its real header. */
const PREAMBLE_SCAN_LINES = 25

export type CsvParseResult = {
  format: BankCsvFormat
  rows: ParsedRow[]
  headers: string[]
  errors: string[]
  error: string | null
}

export function parseBankCsv(text: string): CsvParseResult {
  const body = text.replace(/^﻿/, '')
  const lines = body.split(/\r\n|\n|\r/)
  if (lines.length === 0 || lines.every((l) => l.trim() === '')) {
    return { format: 'UNKNOWN', rows: [], headers: [], errors: [], error: 'The file is empty.' }
  }

  let format: BankCsvFormat = 'UNKNOWN'
  let headerIndex = -1

  for (let i = 0; i < Math.min(PREAMBLE_SCAN_LINES, lines.length); i += 1) {
    const cells = splitCsvLine(lines[i] ?? '')
      .map((c) => c.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean)
    if (cells.length === 0) continue
    const detected = detectCsvFormat(new Set(cells))
    if (detected !== 'UNKNOWN') {
      format = detected
      headerIndex = i
      break
    }
  }

  if (format === 'UNKNOWN') {
    const first = splitCsvLine(lines.find((l) => l.trim() !== '') ?? '')
      .map((c) => c.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean)
    return {
      format: 'UNKNOWN',
      rows: [],
      headers: first,
      errors: [],
      error: `This layout is not one we recognise. Columns found: ${[...first].sort().join(', ') || 'none'}.`,
    }
  }

  const headerCells = splitCsvLine(lines[headerIndex] ?? '').map((c) =>
    c.replace(/^["']|["']$/g, '').trim(),
  )
  const records: Array<Record<string, string>> = []
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? ''
    if (raw.trim() === '') continue
    const cells = splitCsvLine(raw)
    const record: Record<string, string> = {}
    headerCells.forEach((header, index) => {
      if (header) record[header] = (cells[index] ?? '').replace(/^["']|["']$/g, '').trim()
    })
    records.push(record)
  }

  const errors: string[] = []
  const rows: ParsedRow[] = []

  for (const record of records) {
    try {
      const row = mapCsvRow(format, record)
      if (row) rows.push(row)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'A row could not be read and was skipped.')
    }
  }

  return { format, rows, headers: headerCells.filter(Boolean), errors, error: null }
}

/** Per-bank column mapping. A blank date or amount drops the row, never the file. */
function mapCsvRow(format: BankCsvFormat, row: Record<string, string>): ParsedRow | null {
  const get = (key: string) => (row[key] ?? '').trim()

  switch (format) {
    case 'CHASE_CHECKING': {
      if (!get('Posting Date') || !get('Amount')) return null
      return {
        date: parseStatementDate(get('Posting Date')),
        amount: parseAmount(get('Amount')),
        payee: get('Description'),
        description: get('Description'),
        checkNumber: get('Check or Slip #') || null,
      }
    }
    case 'CHASE_CREDIT': {
      if (!get('Transaction Date') || !get('Amount')) return null
      const category = get('Category')
      const description = get('Description')
      return {
        date: parseStatementDate(get('Transaction Date')),
        amount: parseAmount(get('Amount')),
        payee: description,
        description: category ? `${category} - ${description}` : description,
        checkNumber: null,
      }
    }
    case 'PAYPAL': {
      // The mirror of an Express Checkout payment; it nets to zero here and
      // the real cash movement shows up on the bank's own statement.
      if (get('Type') === 'Bank Deposit to PP Account') return null
      if (!get('Date') || !get('Gross')) return null
      const name = get('Name')
      const title = get('Item Title')
      const parts = [name, title, get('Type')].filter(Boolean)
      return {
        date: parseStatementDate(get('Date')),
        // Gross, never Net: PayPal already took its fee and Net would
        // understate the revenue.
        amount: parseAmount(get('Gross')),
        payee: name || title || 'PayPal Transfer',
        description: parts.join(' | '),
        checkNumber: null,
        fee: get('Fee') ? parseAmount(get('Fee')) : null,
      }
    }
    case 'PAYPAL_NEW': {
      const description = get('Description')
      if (description.startsWith('Bank Deposit to PP Account')) return null
      if (!get('Date') || !get('Gross')) return null
      const name = get('Name')
      return {
        date: parseStatementDate(get('Date')),
        amount: parseAmount(get('Gross')),
        payee: name || description || 'PayPal Transfer',
        description:
          description && name ? `${description} | ${name}` : description || name || '',
        checkNumber: null,
        fee: get('Fee') ? parseAmount(get('Fee')) : null,
      }
    }
    case 'BOFA_DETAIL': {
      const description = get('Description')
      const lowered = description.toLowerCase()
      // Statement metadata, not a transaction — importing it would overstate
      // the account by a whole balance.
      if (lowered.startsWith('beginning balance') || lowered.startsWith('ending balance')) return null
      if (!get('Date') || !get('Amount')) return null
      return {
        date: parseStatementDate(get('Date')),
        amount: parseAmount(get('Amount')),
        payee: description,
        description,
        checkNumber: null,
      }
    }
    default:
      return null
  }
}

const CSV_PREFIX: Record<BankCsvFormat, string> = {
  CHASE_CHECKING: 'chk',
  CHASE_CREDIT: 'cc',
  PAYPAL: 'pp',
  PAYPAL_NEW: 'pp',
  BOFA_DETAIL: 'bofa',
  UNKNOWN: 'csv',
}

/**
 * A CSV has no FITID, so the dedup key is derived from the row's content plus
 * an occurrence counter within the file. Two genuinely identical same-day
 * charges therefore get n=0 and n=1 — both import, and both are recognised on
 * a re-import instead of one silently vanishing.
 */
export function assignImportIds(format: BankCsvFormat, rows: ParsedRow[]): ParsedRow[] {
  const prefix = CSV_PREFIX[format] ?? 'csv'
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const digest = sha256(`${row.payee ?? ''}|${row.description ?? ''}`).slice(0, 12)
    const amount = row.amount.toFixed(2)
    const key = `${isoDate(row.date)}|${amount}|${digest}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return { ...row, importId: `${prefix}_${isoDate(row.date)}_${amount}_${digest}_${n}` }
  })
}

/** SHA-256 of the raw upload: "you already imported this exact file". */
export const fileFingerprint = (content: string) => sha256(content)

// ---------------------------------------------------------------------------
// Import — persistence
// ---------------------------------------------------------------------------

export type ImportSummary = {
  batchId: number | null
  total: number
  imported: number
  skipped: number
  matched: number
  categorised: number
  errors: string[]
  format?: BankCsvFormat
  duplicateFile: boolean
}

async function persistRows(
  db: TenantClient,
  feed: BankAccount,
  rows: ParsedRow[],
  importSource: string,
  batchId: number | null,
) {
  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const importId = row.importId ?? row.fitid ?? ''
    if (importId) {
      // The pre-check is what makes `skipped` a real number; the unique index
      // behind it is what makes a concurrent import safe.
      const existing = await db.bankTransaction.findFirst({
        where: { bankAccountId: feed.id, importId },
        select: { id: true },
      })
      if (existing) {
        skipped += 1
        continue
      }
    }

    let description = (row.description || '').slice(0, 500)
    if (row.fee && !row.fee.isZero()) {
      description = `${description} (fee ${row.fee.toFixed(2)})`.slice(0, 500)
    }

    try {
      await db.bankTransaction.create({
        data: {
          bankAccountId: feed.id,
          date: utcDate(row.date),
          amount: row.amount.toFixed(2),
          payee: (row.payee || '').slice(0, 200) || null,
          description: description || null,
          checkNumber: row.checkNumber ? row.checkNumber.slice(0, 50) : null,
          importId: importId || null,
          importSource,
          matchStatus: 'UNMATCHED',
          importBatchId: batchId,
        },
      })
      imported += 1
    } catch {
      // The unique index caught a row a concurrent import inserted first.
      skipped += 1
    }
  }

  return { imported, skipped }
}

async function nextOccurrence(db: TenantClient, bankAccountId: number, fingerprint: string) {
  return db.importBatch.count({ where: { bankAccountId, fingerprint } })
}

export async function importStatement(
  db: TenantClient,
  input: {
    bankAccountId: number
    content: string
    fileName?: string | null
    channel: ImportChannel
  },
): Promise<ImportSummary> {
  const feed = await db.bankAccount.findUnique({ where: { id: input.bankAccountId } })
  if (!feed) throw new DomainError('Bank feed not found.', 404)

  const fingerprint = fileFingerprint(input.content)
  const occurrence = await nextOccurrence(db, feed.id, fingerprint)

  let rows: ParsedRow[]
  let format: BankCsvFormat | undefined
  let parseErrors: string[] = []
  let importSource: string

  if (input.channel === 'CSV') {
    const parsed = parseBankCsv(input.content)
    if (parsed.error) {
      return {
        batchId: null,
        total: 0,
        imported: 0,
        skipped: 0,
        matched: 0,
        categorised: 0,
        errors: [parsed.error],
        format: parsed.format,
        duplicateFile: occurrence > 0,
      }
    }
    format = parsed.format
    parseErrors = parsed.errors
    rows = assignImportIds(parsed.format, parsed.rows)
    importSource = `csv_${parsed.format.toLowerCase()}`
  } else {
    rows = parseOfx(input.content)
    importSource = input.channel.toLowerCase()
    if (rows.length === 0) {
      return {
        batchId: null,
        total: 0,
        imported: 0,
        skipped: 0,
        matched: 0,
        categorised: 0,
        errors: ['No transactions were found in this file.'],
        duplicateFile: occurrence > 0,
      }
    }
  }

  const batch = await db.importBatch.create({
    data: {
      bankAccountId: feed.id,
      fileName: input.fileName?.slice(0, 255) ?? null,
      fileBytes: Buffer.byteLength(input.content, 'utf8'),
      fingerprint,
      occurrence,
      channel: input.channel,
      csvFormat: format ?? null,
      importSource,
      totalRows: rows.length,
      errorRows: parseErrors.length,
      errors: parseErrors.length ? parseErrors : undefined,
    },
  })

  const { imported, skipped } = await persistRows(db, feed, rows, importSource, batch.id)

  let categorised = 0
  let matched = 0
  if (imported > 0) {
    categorised = await applyBankRules(db, feed.id)
    matched = await autoMatchFeed(db, feed.id)
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { importedRows: imported, skippedRows: skipped, matchedRows: matched, categorisedRows: categorised },
  })

  return {
    batchId: batch.id,
    total: rows.length,
    imported,
    skipped,
    matched,
    categorised,
    errors: parseErrors,
    format,
    duplicateFile: occurrence > 0,
  }
}

/** Parse-only, for the mapping preview before anything is written. */
export function previewStatement(content: string, channel: ImportChannel) {
  if (channel === 'CSV') {
    const parsed = parseBankCsv(content)
    return {
      channel,
      format: parsed.format,
      headers: parsed.headers,
      error: parsed.error,
      errors: parsed.errors,
      rows: parsed.rows,
    }
  }
  const rows = parseOfx(content)
  return {
    channel,
    format: undefined as BankCsvFormat | undefined,
    headers: [] as string[],
    error: rows.length ? null : 'No transactions were found in this file.',
    errors: [] as string[],
    rows,
  }
}

// ---------------------------------------------------------------------------
// Bank rules
// ---------------------------------------------------------------------------

/**
 * A rule is one condition and one action: match the payee, set the category.
 * Rules run in priority order and the first hit wins — even when it writes
 * nothing, because a deliberate "leave this alone" rule is a real answer.
 * Rules never post and never change a line's match status.
 */
export async function applyBankRules(db: TenantClient, bankAccountId?: number): Promise<number> {
  const rules = await db.bankRule.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'desc' }, { name: 'asc' }],
  })
  if (rules.length === 0) return 0

  const lines = await db.bankTransaction.findMany({
    where: { matchStatus: 'UNMATCHED', ...(bankAccountId ? { bankAccountId } : {}) },
  })

  let categorised = 0
  for (const line of lines) {
    const payee = (line.payee ?? '').toLowerCase()
    for (const rule of rules) {
      const pattern = (rule.pattern ?? '').toLowerCase()
      if (!pattern) continue
      const hit =
        rule.ruleType === 'CONTAINS'
          ? payee.includes(pattern)
          : rule.ruleType === 'STARTS_WITH'
            ? payee.startsWith(pattern)
            : rule.ruleType === 'EXACT'
              ? payee === pattern
              : false
      if (!hit) continue

      if (rule.accountId && line.categoryAccountId !== rule.accountId) {
        await db.bankTransaction.update({
          where: { id: line.id },
          data: { categoryAccountId: rule.accountId },
        })
        categorised += 1
      }
      break // first hit wins; no lower-priority rule gets a look in
    }
  }
  return categorised
}

export async function createBankRule(
  db: TenantClient,
  input: {
    name: string
    pattern: string
    ruleType: 'CONTAINS' | 'STARTS_WITH' | 'EXACT'
    accountId?: number | null
    priority?: number
    isActive?: boolean
  },
) {
  return db.bankRule.create({
    data: {
      name: input.name.trim(),
      pattern: input.pattern.trim(),
      ruleType: input.ruleType,
      accountId: input.accountId ?? null,
      priority: input.priority ?? 0,
      isActive: input.isActive ?? true,
    },
  })
}

export async function updateBankRule(
  db: TenantClient,
  id: number,
  patch: Partial<{
    name: string
    pattern: string
    ruleType: 'CONTAINS' | 'STARTS_WITH' | 'EXACT'
    accountId: number | null
    priority: number
    isActive: boolean
  }>,
) {
  const rule = await db.bankRule.findUnique({ where: { id } })
  if (!rule) throw new DomainError('Rule not found.', 404)
  return db.bankRule.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.pattern !== undefined ? { pattern: patch.pattern.trim() } : {}),
      ...(patch.ruleType !== undefined ? { ruleType: patch.ruleType } : {}),
      ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  })
}

export async function deleteBankRule(db: TenantClient, id: number) {
  const rule = await db.bankRule.findUnique({ where: { id } })
  if (!rule) throw new DomainError('Rule not found.', 404)
  await db.bankRule.delete({ where: { id } })
  return { id }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export type Candidate = {
  lineId: number
  transactionId: number
  date: Date
  daysOff: number
  description: string
  payee: string
  reference: string
  sourceType: string
  amount: Decimal
  cleared: boolean
}

/**
 * Ledger lines a statement line could be. Exact amount on the correct side,
 * inside the window, not already claimed, not reconciled, not a reversal.
 * There is no amount tolerance and no fuzzy score — a near miss is a human's
 * decision, not the software's.
 */
export async function candidateLines(
  db: TenantClient,
  accountId: number,
  amount: Decimal,
  onDate: Date,
  opts: { windowDays?: number; excludeLineIds?: Set<number> } = {},
): Promise<Candidate[]> {
  const window = opts.windowDays ?? CANDIDATE_WINDOW_DAYS
  const target = cents(amount)
  const magnitude = target.abs().toFixed(2)
  const side: Prisma.TransactionLineWhereInput = target.isPositive()
    ? { debit: magnitude }
    : { credit: magnitude }

  const lines = await db.transactionLine.findMany({
    where: {
      accountId,
      ...side,
      reconciliationId: null,
      bankTransactions: { none: {} },
      transaction: {
        isVoided: false,
        date: { gte: addDays(utcDate(onDate), -window), lte: addDays(utcDate(onDate), window) },
      },
    },
    include: { transaction: true },
  })

  const exclude = opts.excludeLineIds ?? new Set<number>()
  const usable = lines.filter((line) => !exclude.has(line.id))
  const payees = await payeesFor(db, usable.map((l) => l.transaction))

  return usable
    .map((line) => ({
      lineId: line.id,
      transactionId: line.transactionId,
      date: line.transaction.date,
      daysOff: daysBetween(utcDate(line.transaction.date), utcDate(onDate)),
      description: line.transaction.description || line.description || '',
      payee: payees.get(line.transactionId) ?? '',
      reference: line.transaction.reference ?? '',
      sourceType: line.transaction.sourceType ?? 'journal',
      amount: target,
      cleared: line.cleared,
    }))
    .sort((a, b) => a.daysOff - b.daysOff || a.transactionId - b.transactionId || a.lineId - b.lineId)
}

async function link(
  db: TenantClient,
  bankTransactionId: number,
  line: { id: number; transactionId: number },
  status: 'AUTO' | 'MANUAL' | 'ADDED',
) {
  await db.bankTransaction.update({
    where: { id: bankTransactionId },
    data: {
      transactionId: line.transactionId,
      transactionLineId: line.id,
      matchStatus: status,
    },
  })
  await db.transactionLine.update({ where: { id: line.id }, data: { cleared: true } })
}

/**
 * The auto-match pass. For each unmatched statement line, oldest first:
 * exact amount on the right side, within ±5 days, optionally narrowed to lines
 * whose reference equals the check number. The winner must be the *unique*
 * nearest by date — a tie is left for a person, because guessing between two
 * equally plausible postings is how a bank feed silently duplicates a payment.
 */
export async function autoMatch(
  db: TenantClient,
  feed: BankAccount,
  rows: BankTransaction[],
): Promise<number> {
  if (!feed.accountId) return 0
  const consumed = new Set<number>()
  let matched = 0

  const ordered = [...rows].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id,
  )

  for (const row of ordered) {
    if (row.matchStatus !== 'UNMATCHED') continue

    let candidates = await candidateLines(
      db,
      feed.accountId,
      money(row.amount.toString()),
      row.date,
      { windowDays: AUTO_WINDOW_DAYS, excludeLineIds: consumed },
    )

    if (row.checkNumber) {
      const byReference = candidates.filter((c) => c.reference === row.checkNumber)
      if (byReference.length) candidates = byReference
    }

    if (candidates.length === 0) continue
    const nearest = candidates.filter((c) => c.daysOff === candidates[0]!.daysOff)
    if (nearest.length !== 1) continue

    const winner = nearest[0]!
    await link(db, row.id, { id: winner.lineId, transactionId: winner.transactionId }, 'AUTO')
    consumed.add(winner.lineId)
    matched += 1
  }

  return matched
}

export async function autoMatchFeed(db: TenantClient, bankAccountId: number) {
  const feed = await db.bankAccount.findUnique({ where: { id: bankAccountId } })
  if (!feed) return 0
  const rows = await db.bankTransaction.findMany({
    where: { bankAccountId, matchStatus: 'UNMATCHED' },
  })
  return autoMatch(db, feed, rows)
}

async function loadStatementLine(db: TenantClient, id: number) {
  const row = await db.bankTransaction.findUnique({
    where: { id },
    include: { bankAccount: true },
  })
  if (!row) throw new DomainError('Statement line not found.', 404)
  return row
}

export async function matchStatementLine(db: TenantClient, id: number, lineId: number) {
  const row = await loadStatementLine(db, id)
  const account = await feedAccount(db, row.bankAccount)

  if (row.transactionLineId) throw new DomainError('This statement line is already matched.')

  const line = await db.transactionLine.findUnique({ where: { id: lineId } })
  if (!line || line.accountId !== account.id) {
    throw new DomainError('That ledger line is not on this account.')
  }

  const amount = money(row.amount.toString())
  const have = amount.isPositive() ? money(line.debit.toString()) : money(line.credit.toString())
  if (!cents(have).equals(cents(amount).abs())) {
    throw new DomainError('The amounts differ. A match needs the same amount on the same side.')
  }
  if (line.reconciliationId) {
    throw new DomainError('That line is in a completed reconciliation.')
  }
  const claimed = await db.bankTransaction.findFirst({
    where: { transactionLineId: lineId, id: { not: id } },
    select: { id: true },
  })
  if (claimed) {
    throw new DomainError('That ledger line is already matched to another statement line.')
  }

  await link(db, id, { id: line.id, transactionId: line.transactionId }, 'MANUAL')
  return { id }
}

export async function unmatchStatementLine(db: TenantClient, id: number) {
  const row = await loadStatementLine(db, id)
  if (row.matchStatus === 'ADDED') {
    throw new DomainError('This line was posted from the feed. Void the entry instead.')
  }
  if (!row.transactionLineId) throw new DomainError('This statement line is not matched.')

  const line = await db.transactionLine.findUnique({ where: { id: row.transactionLineId } })
  if (line) {
    if (line.reconciliationId) {
      throw new DomainError('That line is in a completed reconciliation.')
    }
    await db.transactionLine.update({ where: { id: line.id }, data: { cleared: false } })
  }

  await db.bankTransaction.update({
    where: { id },
    data: { transactionId: null, transactionLineId: null, matchStatus: 'UNMATCHED' },
  })
  return { id }
}

/** Accept a feed line into the books: post it, then link it to its own line. */
export async function addStatementLine(
  db: TenantClient,
  id: number,
  input: {
    categoryAccountId?: number | null
    payee?: string | null
    memo?: string | null
    classId?: number | null
    jobId?: number | null
  } = {},
) {
  const row = await loadStatementLine(db, id)
  const account = await feedAccount(db, row.bankAccount)

  if (row.transactionLineId || row.matchStatus === 'ADDED') {
    throw new DomainError('This statement line is already in the books.')
  }

  const categoryId = input.categoryAccountId ?? row.categoryAccountId
  if (!categoryId) {
    throw new DomainError('Pick a category before adding this line to the books.')
  }
  const category = await db.account.findUnique({ where: { id: categoryId } })
  if (!category) throw new DomainError('That category account no longer exists.', 404)

  await assertPostable(db, row.date)

  const posted = await db.$transaction(async (tx) =>
    postBankEntry(tx, {
      account,
      category,
      date: row.date,
      amount: money(row.amount.toString()),
      payee: input.payee ?? row.payee,
      memo: input.memo ?? row.description,
      reference: row.checkNumber,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      sourceId: row.id,
    }),
  )

  const bankLine = posted.transactionLines.find((l) => l.accountId === account.id)
  if (!bankLine) throw new DomainError('The entry posted but its bank line could not be found.', 500)

  await link(db, id, { id: bankLine.id, transactionId: posted.id }, 'ADDED')
  if (input.categoryAccountId) {
    await db.bankTransaction.update({
      where: { id },
      data: { categoryAccountId: input.categoryAccountId },
    })
  }
  return { id, transactionId: posted.id }
}

export async function excludeStatementLine(db: TenantClient, id: number) {
  const row = await loadStatementLine(db, id)
  if (row.transactionLineId) throw new DomainError('Unmatch this line first.')
  await db.bankTransaction.update({ where: { id }, data: { matchStatus: 'EXCLUDED' } })
  return { id }
}

export async function restoreStatementLine(db: TenantClient, id: number) {
  const row = await loadStatementLine(db, id)
  if (row.matchStatus !== 'EXCLUDED') throw new DomainError('This statement line is not excluded.')
  await db.bankTransaction.update({ where: { id }, data: { matchStatus: 'UNMATCHED' } })
  return { id }
}

/**
 * Accept every categorised line in one go. Each one is attempted on its own —
 * a closed period or a deleted category is reported and skipped, not allowed
 * to roll back the whole batch.
 */
export async function addAllStatementLines(db: TenantClient, bankAccountId: number) {
  const rows = await db.bankTransaction.findMany({
    where: { bankAccountId, matchStatus: 'UNMATCHED', categoryAccountId: { not: null } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  })

  let added = 0
  const skipped: Array<{ id: number; reason: string }> = []
  for (const row of rows) {
    try {
      await addStatementLine(db, row.id)
      added += 1
    } catch (error) {
      skipped.push({
        id: row.id,
        reason: error instanceof Error ? error.message : 'Could not be added.',
      })
    }
  }
  return { added, skipped }
}

export type ReviewLine = BankTransaction & {
  categoryAccount: Account | null
  suggestion: Candidate | null
}

/** The review queue for one feed, with the single best match offered inline. */
export async function reviewQueue(
  db: TenantClient,
  bankAccountId: number,
  status: 'UNMATCHED' | 'AUTO' | 'MANUAL' | 'ADDED' | 'EXCLUDED' = 'UNMATCHED',
  opts: { take?: number; skip?: number } = {},
) {
  const [rows, total] = await Promise.all([
    db.bankTransaction.findMany({
      where: { bankAccountId, matchStatus: status },
      include: { categoryAccount: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: opts.take ?? 50,
      skip: opts.skip ?? 0,
    }),
    db.bankTransaction.count({ where: { bankAccountId, matchStatus: status } }),
  ])

  const feed = await db.bankAccount.findUnique({ where: { id: bankAccountId } })
  const lines: ReviewLine[] = []
  for (const row of rows) {
    let suggestion: Candidate | null = null
    if (status === 'UNMATCHED' && feed?.accountId) {
      const candidates = await candidateLines(
        db,
        feed.accountId,
        money(row.amount.toString()),
        row.date,
        { windowDays: AUTO_WINDOW_DAYS },
      )
      suggestion = candidates.length === 1 ? candidates[0]! : null
    }
    lines.push({ ...row, suggestion })
  }
  return { lines, total }
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export type TransferRow = {
  id: number
  date: Date
  fromAccountId: number
  fromAccountName: string
  toAccountId: number
  toAccountName: string
  amount: Decimal
  memo: string
  reference: string
  voided: boolean
}

export async function listTransfers(db: TenantClient, opts: { take?: number; skip?: number } = {}) {
  const where = { sourceType: 'transfer' } satisfies Prisma.TransactionWhereInput
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { transactionLines: { include: { account: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: opts.take ?? 50,
      skip: opts.skip ?? 0,
    }),
    db.transaction.count({ where }),
  ])

  const transfers: TransferRow[] = rows.map((txn) => {
    const to = txn.transactionLines.find((l) => money(l.debit.toString()).greaterThan(0))
    const from = txn.transactionLines.find((l) => money(l.credit.toString()).greaterThan(0))
    const description = txn.description ?? ''
    const separator = description.indexOf(' — ')
    return {
      id: txn.id,
      date: txn.date,
      fromAccountId: from?.accountId ?? 0,
      fromAccountName: from?.account.name ?? '',
      toAccountId: to?.accountId ?? 0,
      toAccountName: to?.account.name ?? '',
      amount: money(to?.debit.toString() ?? 0),
      memo: separator >= 0 ? description.slice(separator + 3) : '',
      reference: txn.reference ?? '',
      voided: txn.isVoided,
    }
  })

  return { transfers, total }
}

export async function createTransfer(
  db: TenantClient,
  input: {
    date: Date
    fromAccountId: number
    toAccountId: number
    amount: Decimal.Value
    memo?: string | null
    reference?: string | null
  },
) {
  await assertPostable(db, utcDate(input.date))
  const fromAccount = await requireBankLedgerAccount(db, input.fromAccountId)
  const toAccount = await requireBankLedgerAccount(db, input.toAccountId)

  return db.$transaction(async (tx) =>
    postTransfer(tx, {
      date: input.date,
      fromAccount,
      toAccount,
      amount: input.amount,
      memo: input.memo,
      reference: input.reference,
    }),
  )
}

// ---------------------------------------------------------------------------
// Deposits from undeposited funds
// ---------------------------------------------------------------------------

export type PendingDeposit = {
  transactionLineId: number
  transactionId: number
  date: Date
  description: string
  reference: string
  sourceType: string
  amount: Decimal
}

/**
 * Payments that landed in Undeposited Funds and have not gone to the bank yet.
 * Credits already posted against the account consume the oldest debits first,
 * so what is left is genuinely still in the drawer.
 */
export async function pendingDeposits(db: TenantClient): Promise<PendingDeposit[]> {
  const ufId = await db.account
    .findFirst({ where: { accountNumber: CONTROL_ACCOUNTS.UNDEPOSITED_FUNDS } })
    .then((a) => a?.id ?? null)
  if (!ufId) return []

  const lines = await db.transactionLine.findMany({
    where: { accountId: ufId, debit: { gt: 0 }, transaction: { isVoided: false } },
    include: { transaction: true },
    orderBy: [{ transaction: { date: 'desc' } }, { id: 'desc' }],
  })

  const credits = await db.transactionLine.aggregate({
    where: { accountId: ufId, transaction: { isVoided: false } },
    _sum: { credit: true },
  })

  const totalCredits = money(credits._sum.credit?.toString() ?? 0)
  const totalDebits = sum(lines.map((l) => money(l.debit.toString())))
  if (totalCredits.greaterThanOrEqualTo(totalDebits)) return []

  let running = totalCredits
  const pending: PendingDeposit[] = []
  for (const line of lines) {
    const debit = money(line.debit.toString())
    if (running.greaterThanOrEqualTo(debit)) {
      running = running.minus(debit)
      continue
    }
    pending.push({
      transactionLineId: line.id,
      transactionId: line.transactionId,
      date: line.transaction.date,
      description: line.transaction.description || line.description || '',
      reference: line.transaction.reference ?? '',
      sourceType: line.transaction.sourceType ?? 'journal',
      amount: debit,
    })
  }
  return pending
}

export async function createDeposit(
  db: TenantClient,
  input: {
    depositToAccountId: number
    date: Date
    total: Decimal.Value
    reference?: string | null
    classId?: number | null
    jobId?: number | null
  },
) {
  const total = cents(input.total)
  if (total.lessThanOrEqualTo(0)) throw new DomainError('A deposit amount must be positive.')

  await assertPostable(db, utcDate(input.date))
  const bank = await requireBankLedgerAccount(db, input.depositToAccountId)
  const ufId = await controlAccountId(db, CONTROL_ACCOUNTS.UNDEPOSITED_FUNDS)

  const description = `Deposit to ${bank.name}`
  return db.$transaction(async (tx) =>
    postJournalEntry(tx, {
      date: utcDate(input.date),
      description,
      reference: input.reference ?? '',
      sourceType: 'deposit',
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: [
        { accountId: bank.id, debit: total, description },
        { accountId: ufId, credit: total, description },
      ],
    }),
  )
}

export type DepositRow = {
  id: number
  date: Date
  accountId: number
  accountName: string
  amount: Decimal
  reference: string
  voided: boolean
}

/** Deposits already made — the history under the "still in the drawer" list. */
export async function listDeposits(db: TenantClient, opts: { take?: number } = {}) {
  const rows = await db.transaction.findMany({
    where: { sourceType: 'deposit' },
    include: { transactionLines: { include: { account: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: opts.take ?? 50,
  })

  return rows.map((txn): DepositRow => {
    const bank = txn.transactionLines.find((l) => money(l.debit.toString()).greaterThan(0))
    return {
      id: txn.id,
      date: txn.date,
      accountId: bank?.accountId ?? 0,
      accountName: bank?.account.name ?? '',
      amount: money(bank?.debit.toString() ?? 0),
      reference: txn.reference ?? '',
      voided: txn.isVoided,
    }
  })
}

export type { Account, BankAccount, BankTransaction, TransactionLine }
