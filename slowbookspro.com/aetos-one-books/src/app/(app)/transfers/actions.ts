'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { actionError } from '@/server/accounts'
import { createTransfer, utcDate, voidPosting } from '@/server/banking'

const TransferSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  fromAccountId: z.coerce.number().int().positive(),
  toAccountId: z.coerce.number().int().positive(),
  amount: z
    .string()
    .trim()
    .regex(/^\d*(\.\d{1,2})?$/, 'Enter an amount like 250.00')
    .refine((value) => value !== '', 'Enter an amount'),
  memo: z.string().trim().max(300).nullish(),
  reference: z.string().trim().max(100).nullish(),
})

export async function createTransferAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const data = TransferSchema.parse(input)

    if (data.fromAccountId === data.toAccountId) {
      return { ok: false as const, error: 'A transfer needs two different accounts.' }
    }

    const posted = await createTransfer(db, {
      date: utcDate(data.date),
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      amount: data.amount,
      memo: data.memo ?? null,
      reference: data.reference ?? null,
    })

    revalidatePath('/transfers')
    revalidatePath('/banking')
    revalidatePath('/journal')
    return { ok: true as const, id: posted.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function voidTransferAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(input)

    const transfer = await db.transaction.findFirst({ where: { id, sourceType: 'transfer' } })
    if (!transfer) return { ok: false as const, error: 'That transfer no longer exists.' }

    await voidPosting(db, id)
    revalidatePath('/transfers')
    revalidatePath('/banking')
    revalidatePath('/journal')
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}
