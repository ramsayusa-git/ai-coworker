'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { actionError, requireBankLedgerAccount } from '@/server/accounts'
import {
  addAllStatementLines,
  addStatementLine,
  applyBankRules,
  autoMatchFeed,
  createBankRule,
  createFeed,
  createTransfer,
  deleteBankRule,
  excludeStatementLine,
  matchStatementLine,
  postBankEntry,
  restoreStatementLine,
  unmatchStatementLine,
  updateBankRule,
  updateFeed,
  utcDate,
  voidPosting,
} from '@/server/banking'
import {
  completeReconciliation,
  setAllCleared,
  startReconciliation,
  toggleCleared,
  undoReconciliation,
} from '@/server/reconcile'

const Id = z.coerce.number().int().positive()
const IdSchema = z.object({ id: Id })
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
const Amount = z
  .string()
  .trim()
  .regex(/^-?\d*(\.\d{1,2})?$/, 'Enter an amount like 125.00')
  .refine((v) => v !== '' && v !== '-', 'Enter an amount')

function refresh() {
  revalidatePath('/banking')
  revalidatePath('/banking/rules')
  revalidatePath('/banking/reconcile')
  revalidatePath('/accounts')
  revalidatePath('/journal')
}

async function bookkeeper() {
  const ctx = await getAppContext()
  requireRole(principalFrom(ctx.session), 'BOOKKEEPER')
  return ctx
}

// --- feeds -----------------------------------------------------------------

export async function createFeedAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const data = z
      .object({
        name: z.string().trim().min(1, 'Name the feed').max(200),
        accountId: Id,
        bankName: z.string().trim().max(200).nullish(),
        lastFour: z.string().trim().max(4).nullish(),
        openingBalance: Amount.nullish(),
        openingDate: DateString.nullish(),
      })
      .parse(input)

    const feed = await createFeed(db, {
      name: data.name,
      accountId: data.accountId,
      bankName: data.bankName ?? null,
      lastFour: data.lastFour ?? null,
      openingBalance: data.openingBalance ?? 0,
      openingDate: data.openingDate ? utcDate(data.openingDate) : null,
    })
    refresh()
    return { ok: true as const, id: feed.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function updateFeedAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id, ...patch } = z
      .object({
        id: Id,
        name: z.string().trim().min(1).max(200).optional(),
        accountId: Id.optional(),
        bankName: z.string().trim().max(200).nullish(),
        lastFour: z.string().trim().max(4).nullish(),
        isActive: z.boolean().optional(),
      })
      .parse(input)
    await updateFeed(db, id, patch)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

// --- register entries ------------------------------------------------------

export async function createRegisterEntryAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const data = z
      .object({
        accountId: Id,
        categoryAccountId: Id,
        date: DateString,
        amount: Amount,
        payee: z.string().trim().max(200).nullish(),
        memo: z.string().trim().max(300).nullish(),
        reference: z.string().trim().max(100).nullish(),
      })
      .parse(input)

    const account = await requireBankLedgerAccount(db, data.accountId)
    const category = await db.account.findUnique({ where: { id: data.categoryAccountId } })
    if (!category) return { ok: false as const, error: 'That category account no longer exists.' }

    const posted = await db.$transaction(async (tx) =>
      postBankEntry(tx, {
        account,
        category,
        date: utcDate(data.date),
        amount: data.amount,
        payee: data.payee ?? null,
        memo: data.memo ?? null,
        reference: data.reference ?? null,
      }),
    )
    refresh()
    return { ok: true as const, id: posted.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function voidRegisterEntryAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    await voidPosting(db, id)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

// --- the review queue ------------------------------------------------------

export async function setStatementCategoryAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id, categoryAccountId } = z
      .object({ id: Id, categoryAccountId: Id.nullable() })
      .parse(input)
    await db.bankTransaction.update({ where: { id }, data: { categoryAccountId } })
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function acceptStatementLineAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const data = z
      .object({
        id: Id,
        categoryAccountId: Id.nullish(),
        payee: z.string().trim().max(200).nullish(),
        memo: z.string().trim().max(300).nullish(),
      })
      .parse(input)
    const result = await addStatementLine(db, data.id, {
      categoryAccountId: data.categoryAccountId ?? null,
      payee: data.payee ?? null,
      memo: data.memo ?? null,
    })
    refresh()
    return { ok: true as const, id: result.transactionId }
  } catch (error) {
    return actionError(error)
  }
}

export async function matchStatementLineAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id, lineId } = z.object({ id: Id, lineId: Id }).parse(input)
    await matchStatementLine(db, id, lineId)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function unmatchStatementLineAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    await unmatchStatementLine(db, id)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function excludeStatementLineAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    await excludeStatementLine(db, id)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function restoreStatementLineAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    await restoreStatementLine(db, id)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function acceptAllStatementLinesAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { bankAccountId } = z.object({ bankAccountId: Id }).parse(input)
    const result = await addAllStatementLines(db, bankAccountId)
    refresh()
    return { ok: true as const, added: result.added, skipped: result.skipped }
  } catch (error) {
    return actionError(error)
  }
}

export async function autoMatchFeedAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { bankAccountId } = z.object({ bankAccountId: Id }).parse(input)
    const matched = await autoMatchFeed(db, bankAccountId)
    refresh()
    return { ok: true as const, matched }
  } catch (error) {
    return actionError(error)
  }
}

// --- rules -----------------------------------------------------------------

const RuleSchema = z.object({
  name: z.string().trim().min(1, 'Name the rule').max(200),
  pattern: z.string().trim().min(1, 'A rule with no pattern never matches').max(200),
  ruleType: z.enum(['CONTAINS', 'STARTS_WITH', 'EXACT']),
  accountId: Id.nullish(),
  priority: z.coerce.number().int().min(-999).max(999).default(0),
  isActive: z.boolean().default(true),
})

export async function createBankRuleAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const data = RuleSchema.parse(input)
    const rule = await createBankRule(db, { ...data, accountId: data.accountId ?? null })
    refresh()
    return { ok: true as const, id: rule.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function updateBankRuleAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id, ...patch } = IdSchema.merge(RuleSchema.partial()).parse(input)
    await updateBankRule(db, id, patch)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function deleteBankRuleAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    await deleteBankRule(db, id)
    refresh()
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function applyBankRulesAction() {
  try {
    const { db } = await bookkeeper()
    const categorised = await applyBankRules(db)
    const remaining = await db.bankTransaction.count({ where: { matchStatus: 'UNMATCHED' } })
    refresh()
    return { ok: true as const, categorised, remaining }
  } catch (error) {
    return actionError(error)
  }
}

// --- reconciliation --------------------------------------------------------

export async function startReconciliationAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const data = z
      .object({ accountId: Id, statementDate: DateString, statementBalance: Amount })
      .parse(input)
    const recon = await startReconciliation(db, {
      accountId: data.accountId,
      statementDate: utcDate(data.statementDate),
      statementBalance: data.statementBalance,
    })
    refresh()
    return { ok: true as const, id: recon.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function toggleClearedAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { reconciliationId, lineId } = z
      .object({ reconciliationId: Id, lineId: Id })
      .parse(input)
    const result = await toggleCleared(db, reconciliationId, lineId)
    revalidatePath('/banking/reconcile')
    return { ok: true as const, cleared: result.cleared }
  } catch (error) {
    return actionError(error)
  }
}

export async function setAllClearedAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { reconciliationId, cleared } = z
      .object({ reconciliationId: Id, cleared: z.boolean() })
      .parse(input)
    const result = await setAllCleared(db, reconciliationId, cleared)
    revalidatePath('/banking/reconcile')
    return { ok: true as const, count: result.count }
  } catch (error) {
    return actionError(error)
  }
}

export async function completeReconciliationAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    const result = await completeReconciliation(db, id)
    refresh()
    return { ok: true as const, clearedCount: result.clearedCount }
  } catch (error) {
    return actionError(error)
  }
}

export async function undoReconciliationAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const { id } = IdSchema.parse(input)
    const result = await undoReconciliation(db, id)
    refresh()
    return { ok: true as const, outcome: result.outcome }
  } catch (error) {
    return actionError(error)
  }
}

// --- transfers and deposits live on their own pages but post from here ------

export async function createTransferFromBankingAction(input: unknown) {
  try {
    const { db } = await bookkeeper()
    const data = z
      .object({
        date: DateString,
        fromAccountId: Id,
        toAccountId: Id,
        amount: Amount,
        memo: z.string().trim().max(300).nullish(),
        reference: z.string().trim().max(100).nullish(),
      })
      .parse(input)
    const posted = await createTransfer(db, {
      date: utcDate(data.date),
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      amount: data.amount,
      memo: data.memo ?? null,
      reference: data.reference ?? null,
    })
    refresh()
    revalidatePath('/transfers')
    return { ok: true as const, id: posted.id }
  } catch (error) {
    return actionError(error)
  }
}
