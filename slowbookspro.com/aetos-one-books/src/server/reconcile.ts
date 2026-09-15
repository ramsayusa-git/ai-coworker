import 'server-only'
import { Decimal } from 'decimal.js'
import { money, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import type { Account, Reconciliation } from '@/generated/tenant/client'
import { DomainError, isDebitNormal, requireBankLedgerAccount } from './accounts'
import { isoDate, utcDate } from './banking'

/**
 * Reconciliation: tick what the statement shows, and finish only when the
 * difference is nothing.
 *
 *   difference = statement balance − (beginning balance + cleared total)
 *
 * The cleared flag lives on the ledger line, not on a side table, so a tick
 * survives everything except a void. Finishing stamps every ticked line with
 * the reconciliation id, which is what makes a closed month refuse to be
 * voided. Undo is only available while the session is open — a finished
 * statement is undone by reopening it deliberately, not by accident.
 */

const TOLERANCE = new Decimal('0.005')

export type ReconcileLine = {
  lineId: number
  transactionId: number
  date: Date
  payee: string
  description: string
  reference: string
  /** Natural-signed: a card shows what you owe as a positive number. */
  amount: Decimal
  cleared: boolean
  /** A statement line already points at this ledger line. */
  matched: boolean
  sourceType: string
}

export type ReconcileSession = {
  reconciliation: Reconciliation
  account: Account
  naturalBalance: 'debit' | 'credit'
  statementDate: Date
  statementBalance: Decimal
  beginningBalance: Decimal
  clearedTotal: Decimal
  unclearedTotal: Decimal
  difference: Decimal
  clearedCount: number
  lines: ReconcileLine[]
}

export async function listReconciliations(db: TenantClient, accountId?: number) {
  return db.reconciliation.findMany({
    where: accountId ? { accountId } : {},
    include: { account: true },
    orderBy: [{ statementDate: 'desc' }, { id: 'desc' }],
  })
}

export const inProgressFor = (db: TenantClient, accountId: number) =>
  db.reconciliation.findFirst({ where: { accountId, status: 'IN_PROGRESS' } })

/**
 * Open a session. The beginning balance is not a number the user types — it is
 * the previous completed statement's ending balance, so two consecutive
 * reconciliations cannot silently disagree about where the month started.
 */
export async function startReconciliation(
  db: TenantClient,
  input: { accountId: number; statementDate: Date; statementBalance: Decimal.Value },
) {
  await requireBankLedgerAccount(db, input.accountId)

  const existing = await inProgressFor(db, input.accountId)
  if (existing) {
    throw new DomainError(
      `A reconciliation for this account is already open (statement date ${isoDate(existing.statementDate)}). Finish or undo it first.`,
      409,
    )
  }

  const previous = await db.reconciliation.findFirst({
    where: { accountId: input.accountId, status: 'COMPLETED' },
    orderBy: [{ statementDate: 'desc' }, { id: 'desc' }],
  })

  return db.reconciliation.create({
    data: {
      accountId: input.accountId,
      statementDate: utcDate(input.statementDate),
      statementBalance: money(input.statementBalance).toFixed(2),
      beginningBalance: (previous ? money(previous.statementBalance.toString()) : ZERO).toFixed(2),
      status: 'IN_PROGRESS',
    },
  })
}

async function candidateLines(db: TenantClient, recon: Reconciliation) {
  return db.transactionLine.findMany({
    where: {
      accountId: recon.accountId ?? -1,
      transaction: { date: { lte: recon.statementDate }, isVoided: false },
      OR: [{ reconciliationId: null }, { reconciliationId: recon.id }],
    },
    include: { transaction: true, bankTransactions: { select: { id: true } } },
    orderBy: [{ transaction: { date: 'asc' } }, { transactionId: 'asc' }, { id: 'asc' }],
  })
}

/** The live session: every candidate line, the two totals, and the difference. */
export async function reconciliationSession(
  db: TenantClient,
  reconciliationId: number,
): Promise<ReconcileSession> {
  const recon = await db.reconciliation.findUnique({ where: { id: reconciliationId } })
  if (!recon) throw new DomainError('Reconciliation not found.', 404)
  if (!recon.accountId) {
    throw new DomainError('This reconciliation has no ledger account and cannot be reopened.')
  }

  const account = await db.account.findUnique({ where: { id: recon.accountId } })
  if (!account) throw new DomainError('The reconciled account no longer exists.', 404)
  const debitNormal = isDebitNormal(account.accountType)

  const rows = await candidateLines(db, recon)

  let clearedTotal = ZERO
  let unclearedTotal = ZERO
  let clearedCount = 0
  const lines: ReconcileLine[] = rows.map((row) => {
    const dr = money(row.debit.toString())
    const cr = money(row.credit.toString())
    const amount = debitNormal ? dr.minus(cr) : cr.minus(dr)
    if (row.cleared) {
      clearedTotal = clearedTotal.plus(amount)
      clearedCount += 1
    } else {
      unclearedTotal = unclearedTotal.plus(amount)
    }
    return {
      lineId: row.id,
      transactionId: row.transactionId,
      date: row.transaction.date,
      payee: row.transaction.description ?? '',
      description: row.transaction.description || row.description || '',
      reference: row.transaction.reference ?? '',
      amount,
      cleared: row.cleared,
      matched: row.bankTransactions.length > 0,
      sourceType: row.transaction.sourceType ?? 'journal',
    }
  })

  const statementBalance = money(recon.statementBalance.toString())
  const beginningBalance = money(recon.beginningBalance.toString())

  return {
    reconciliation: recon,
    account,
    naturalBalance: debitNormal ? 'debit' : 'credit',
    statementDate: recon.statementDate,
    statementBalance,
    beginningBalance,
    clearedTotal,
    unclearedTotal,
    difference: statementBalance.minus(beginningBalance.plus(clearedTotal)),
    clearedCount,
    lines,
  }
}

/** Tick or untick one ledger line. */
export async function toggleCleared(
  db: TenantClient,
  reconciliationId: number,
  lineId: number,
) {
  const recon = await db.reconciliation.findUnique({ where: { id: reconciliationId } })
  if (!recon) throw new DomainError('Reconciliation not found.', 404)
  if (recon.status === 'COMPLETED') throw new DomainError('This reconciliation is already finished.')

  const line = await db.transactionLine.findUnique({
    where: { id: lineId },
    include: { transaction: true },
  })
  if (!line) throw new DomainError('Ledger line not found.', 404)
  if (line.accountId !== recon.accountId) {
    throw new DomainError('That line is not on this account.')
  }
  if (line.reconciliationId && line.reconciliationId !== recon.id) {
    throw new DomainError('That line is in a completed reconciliation.')
  }
  if (utcDate(line.transaction.date) > utcDate(recon.statementDate)) {
    throw new DomainError('That line is dated after the statement date.')
  }

  const updated = await db.transactionLine.update({
    where: { id: lineId },
    data: { cleared: !line.cleared },
  })
  return { lineId, cleared: updated.cleared }
}

/** Tick or untick every line in the session at once. */
export async function setAllCleared(
  db: TenantClient,
  reconciliationId: number,
  cleared: boolean,
) {
  const recon = await db.reconciliation.findUnique({ where: { id: reconciliationId } })
  if (!recon) throw new DomainError('Reconciliation not found.', 404)
  if (recon.status === 'COMPLETED') throw new DomainError('This reconciliation is already finished.')

  const rows = await candidateLines(db, recon)
  await db.transactionLine.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { cleared },
  })
  return { count: rows.length }
}

/**
 * Finish. The difference is recomputed here from the ledger — a client-supplied
 * total is never trusted — and every ticked line is stamped, which is what
 * later refuses a void.
 */
export async function completeReconciliation(db: TenantClient, reconciliationId: number) {
  const session = await reconciliationSession(db, reconciliationId)
  if (session.reconciliation.status === 'COMPLETED') {
    throw new DomainError('This reconciliation is already finished.')
  }
  if (session.difference.abs().greaterThan(TOLERANCE)) {
    throw new DomainError(
      `The difference is ${session.difference.toFixed(2)} — it must be 0.00 to finish. Tick or untick lines until it clears, or check the statement's ending balance.`,
    )
  }

  const clearedIds = session.lines.filter((l) => l.cleared).map((l) => l.lineId)

  await db.$transaction(async (tx) => {
    await tx.transactionLine.updateMany({
      where: { id: { in: clearedIds } },
      data: { reconciliationId },
    })
    await tx.reconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: 'COMPLETED',
        clearedTotal: session.clearedTotal.toFixed(2),
        completedAt: new Date(),
      },
    })
  })

  return { reconciliationId, clearedCount: clearedIds.length }
}

/**
 * Undo. An open session is simply dropped — the cleared ticks stay, because
 * they are facts about the lines, not about the session. A finished one is
 * reopened: the stamps come off, so the lines are voidable again, and the
 * session goes back to in progress with its ticks intact.
 */
export async function undoReconciliation(db: TenantClient, reconciliationId: number) {
  const recon = await db.reconciliation.findUnique({ where: { id: reconciliationId } })
  if (!recon) throw new DomainError('Reconciliation not found.', 404)

  if (recon.status === 'IN_PROGRESS') {
    await db.reconciliation.delete({ where: { id: reconciliationId } })
    return { reconciliationId, outcome: 'abandoned' as const }
  }

  const later = await db.reconciliation.findFirst({
    where: {
      accountId: recon.accountId ?? -1,
      status: 'COMPLETED',
      statementDate: { gt: recon.statementDate },
    },
  })
  if (later) {
    throw new DomainError(
      `A later statement (${isoDate(later.statementDate)}) is already reconciled. Undo that one first.`,
    )
  }
  const open = await inProgressFor(db, recon.accountId ?? -1)
  if (open) {
    throw new DomainError('Finish or undo the open reconciliation on this account first.')
  }

  await db.$transaction(async (tx) => {
    await tx.transactionLine.updateMany({
      where: { reconciliationId },
      data: { reconciliationId: null },
    })
    await tx.reconciliation.update({
      where: { id: reconciliationId },
      data: { status: 'IN_PROGRESS', completedAt: null, clearedTotal: null },
    })
  })

  return { reconciliationId, outcome: 'reopened' as const }
}
