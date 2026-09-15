'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  actionError,
  createAccount,
  deleteAccount,
  setAccountActive,
  updateAccount,
} from '@/server/accounts'

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'COGS'] as const

const AccountSchema = z.object({
  name: z.string().trim().min(1, 'Give the account a name').max(200),
  accountNumber: z.string().trim().max(20).nullish(),
  accountType: z.enum(ACCOUNT_TYPES),
  parentId: z.coerce.number().int().positive().nullish(),
  description: z.string().trim().max(500).nullish(),
  bankKind: z.enum(['bank', 'credit_card']).nullish(),
})

const IdSchema = z.object({ id: z.coerce.number().int().positive() })

export async function createAccountAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const data = AccountSchema.parse(input)
    const account = await createAccount(db, {
      ...data,
      accountNumber: data.accountNumber ?? null,
      parentId: data.parentId ?? null,
      description: data.description ?? null,
      bankKind: data.bankKind ?? null,
    })
    revalidatePath('/accounts')
    revalidatePath('/banking')
    return { ok: true as const, id: account.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function updateAccountAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const { id, ...patch } = IdSchema.merge(AccountSchema.partial()).parse(input)
    await updateAccount(db, id, patch)
    revalidatePath('/accounts')
    revalidatePath('/banking')
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function setAccountActiveAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const { id, isActive } = IdSchema.extend({ isActive: z.boolean() }).parse(input)
    await setAccountActive(db, id, isActive)
    revalidatePath('/accounts')
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}

export async function deleteAccountAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'ADMIN')
    const { id } = IdSchema.parse(input)
    await deleteAccount(db, id)
    revalidatePath('/accounts')
    return { ok: true as const, id }
  } catch (error) {
    return actionError(error)
  }
}
