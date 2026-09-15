'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  createCustomer,
  describeSalesFailure,
  setCustomerActive,
  updateCustomer,
} from '@/server/sales'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

const CustomerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  companyName: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  email: z.preprocess(
    blankToNull,
    z.email('Enter a valid email address').max(200).nullable().optional(),
  ),
  phone: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  mobile: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  website: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  billAddress1: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  billAddress2: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  billCity: z.preprocess(blankToNull, z.string().max(100).nullable().optional()),
  billState: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  billZip: z.preprocess(blankToNull, z.string().max(20).nullable().optional()),
  shipAddress1: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  shipAddress2: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  shipCity: z.preprocess(blankToNull, z.string().max(100).nullable().optional()),
  shipState: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  shipZip: z.preprocess(blankToNull, z.string().max(20).nullable().optional()),
  terms: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  creditLimit: z.preprocess(blankToNull, z.string().nullable().optional()),
  taxId: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  isTaxable: z.boolean().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable().optional()),
})

export type CustomerActionResult =
  | { ok: true; id: number }
  | { ok: false; error: string; field?: string }

export async function saveCustomer(input: unknown): Promise<CustomerActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z.object({ id: z.number().int().positive().nullable(), data: CustomerSchema }).safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the form and try again.', field: String(issue?.path.at(-1) ?? '') }
  }

  const { id, data } = parsed.data
  try {
    const customer = id
      ? await updateCustomer(db, id, data)
      : await createCustomer(db, data)
    revalidatePath('/customers')
    revalidatePath(`/customers/${customer.id}`)
    return { ok: true, id: customer.id }
  } catch (error) {
    return { ok: false, error: describeSalesFailure(error) }
  }
}

export async function setCustomerActiveAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z.object({ id: z.number().int().positive(), isActive: z.boolean() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That customer could not be identified.' }

  try {
    await setCustomerActive(db, parsed.data.id, parsed.data.isActive)
    revalidatePath('/customers')
    revalidatePath(`/customers/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}
