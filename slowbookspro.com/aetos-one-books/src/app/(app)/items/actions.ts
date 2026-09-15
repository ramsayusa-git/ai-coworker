'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { createItem, describeSalesFailure, setItemActive, updateItem } from '@/server/sales'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const ItemSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  itemType: z.enum(['PRODUCT', 'SERVICE', 'MATERIAL', 'LABOR']),
  description: z.preprocess(blankToNull, z.string().nullable().optional()),
  rate: decimalString,
  cost: decimalString,
  incomeAccountId: z.number().int().positive().nullable().optional(),
  expenseAccountId: z.number().int().positive().nullable().optional(),
  assetAccountId: z.number().int().positive().nullable().optional(),
  isTaxable: z.boolean(),
  trackInventory: z.boolean(),
  reorderPoint: decimalString,
})

export type ItemActionResult = { ok: true; id: number } | { ok: false; error: string; field?: string }

export async function saveItem(input: unknown): Promise<ItemActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: ItemSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the form and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const { id, data } = parsed.data
  try {
    const item = id ? await updateItem(db, id, data) : await createItem(db, data)
    revalidatePath('/items')
    revalidatePath(`/items/${item.id}`)
    return { ok: true, id: item.id }
  } catch (error) {
    return { ok: false, error: describeSalesFailure(error) }
  }
}

export async function setItemActiveAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z.object({ id: z.number().int().positive(), isActive: z.boolean() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That item could not be identified.' }

  try {
    await setItemActive(db, parsed.data.id, parsed.data.isActive)
    revalidatePath('/items')
    revalidatePath(`/items/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}
