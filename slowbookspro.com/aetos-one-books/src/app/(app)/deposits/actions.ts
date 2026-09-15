'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { actionError } from '@/server/accounts'
import { createDeposit, utcDate, voidPosting } from '@/server/banking'

const DepositSchema = z.object({
  depositToAccountId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  total: z
    .string()
    .trim()
    .regex(/^\d*(\.\d{1,2})?$/, 'Enter an amount like 1,250.00 as 1250.00')
    .refine((value) => value !== '', 'Enter an amount'),
  reference: z.string().trim().max(100).nullish(),
  /** Which pending lines the user ticked — recorded for the memo, not posted individually. */
  lineIds: z.array(z.coerce.number().int().positive()).default([]),
})

export async function createDepositAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const data = DepositSchema.parse(input)

    const posted = await createDeposit(db, {
      depositToAccountId: data.depositToAccountId,
      date: utcDate(data.date),
      total: data.total,
      reference: data.reference ?? null,
    })

    revalidatePath('/deposits')
    revalidatePath('/banking')
    revalidatePath('/journal')
    return { ok: true as const, id: posted.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function voidDepositAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(input)

    const deposit = await db.transaction.findFirst({ where: { id, sourceType: 'deposit' } })
    if (!deposit) return { ok: false as const, error: 'That deposit no longer exists.' }

    await voidPosting(db, id)
    revalidatePath('/deposits')
    revalidatePath('/banking')
    revalidatePath('/journal')
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}
