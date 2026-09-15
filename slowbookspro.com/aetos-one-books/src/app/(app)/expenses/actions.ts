'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { parseDateInput } from '@/server/sales'
import {
  describePurchasingFailure,
  recordCardCharge,
  recordExpense,
  voidLedgerDocument,
} from '@/server/purchasing'

const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

const SpendSchema = z.object({
  kind: z.enum(['expense', 'card']),
  date: isoDate,
  vendorId: z.number().int().positive().nullable(),
  payee: z.string().max(200),
  expenseAccountId: z
    .number({ error: 'Choose the account this is spent on' })
    .int()
    .positive('Choose the account this is spent on'),
  paidFromAccountId: z
    .number({ error: 'Choose where the money came from' })
    .int()
    .positive('Choose where the money came from'),
  amount: decimalString,
  reference: z.string().max(100),
  memo: z.string().max(4000),
})

export type SpendResult =
  | { ok: true; id: number }
  | { ok: false; error: string; field?: string }

/**
 * One action behind both documents. An expense and a card charge differ only in
 * what gets credited — a bank account, or the card — so they share a form and a
 * validation path.
 */
export async function saveSpend(input: unknown): Promise<SpendResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = SpendSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the entry and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const data = parsed.data
  try {
    const result =
      data.kind === 'card'
        ? await recordCardCharge(db, {
            date: parseDateInput(data.date),
            vendorId: data.vendorId,
            payee: data.payee,
            expenseAccountId: data.expenseAccountId,
            cardAccountId: data.paidFromAccountId,
            amount: data.amount,
            reference: data.reference,
            memo: data.memo,
          })
        : await recordExpense(db, {
            date: parseDateInput(data.date),
            vendorId: data.vendorId,
            payee: data.payee,
            expenseAccountId: data.expenseAccountId,
            paidFromAccountId: data.paidFromAccountId,
            amount: data.amount,
            reference: data.reference,
            memo: data.memo,
          })
    revalidatePath('/expenses')
    revalidatePath(`/expenses/${result.id}`)
    revalidatePath('/banking')
    return { ok: true, id: result.id }
  } catch (error) {
    return { ok: false, error: describePurchasingFailure(error) }
  }
}

export async function voidSpendAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That entry could not be identified.' }
  try {
    await voidLedgerDocument(db, parsed.data.id)
    revalidatePath('/expenses')
    revalidatePath(`/expenses/${parsed.data.id}`)
    revalidatePath('/banking')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}
