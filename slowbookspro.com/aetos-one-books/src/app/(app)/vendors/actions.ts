'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  createVendor,
  describePurchasingFailure,
  setVendorActive,
  updateVendor,
} from '@/server/purchasing'

const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const VendorSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  companyName: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  email: z.preprocess(
    blankToNull,
    z.email('Enter a valid email address').max(200).nullable().optional(),
  ),
  phone: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  fax: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  website: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  address1: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  address2: z.preprocess(blankToNull, z.string().max(200).nullable().optional()),
  city: z.preprocess(blankToNull, z.string().max(100).nullable().optional()),
  state: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  zip: z.preprocess(blankToNull, z.string().max(20).nullable().optional()),
  country: z.preprocess(blankToNull, z.string().max(100).nullable().optional()),
  terms: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  taxId: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  accountNumber: z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  defaultExpenseAccountId: z.number().int().positive().nullable().optional(),
  is1099Vendor: z.boolean().optional(),
  vendor1099Type: z.preprocess(blankToNull, z.string().max(10).nullable().optional()),
  is1099Eligible: z.boolean().optional(),
  w9OnFile: z.boolean().optional(),
  notes: z.preprocess(blankToNull, z.string().max(4000).nullable().optional()),
})

export type VendorActionResult =
  | { ok: true; id: number }
  | { ok: false; error: string; field?: string }

export async function saveVendor(input: unknown): Promise<VendorActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: VendorSchema })
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
    const vendor = id ? await updateVendor(db, id, data) : await createVendor(db, data)
    revalidatePath('/vendors')
    revalidatePath(`/vendors/${vendor.id}`)
    return { ok: true, id: vendor.id }
  } catch (error) {
    return { ok: false, error: describePurchasingFailure(error) }
  }
}

export async function setVendorActiveAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive(), isActive: z.boolean() })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That vendor could not be identified.' }

  try {
    await setVendorActive(db, parsed.data.id, parsed.data.isActive)
    revalidatePath('/vendors')
    revalidatePath(`/vendors/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}
