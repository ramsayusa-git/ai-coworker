'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { parseDateInput } from '@/server/sales'
import {
  applyVendorCredit,
  describePurchasingFailure,
  issueVendorCredit,
  voidVendorCredit,
  type PurchaseLineInput,
} from '@/server/purchasing'

const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

const LineSchema = z.object({
  itemId: z.number().int().positive().nullable(),
  accountId: z.number().int().positive().nullable(),
  description: z.string().max(2000),
  quantity: decimalString,
  rate: decimalString,
})

export const VendorCreditSchema = z.object({
  vendorId: z.number({ error: 'Choose a vendor' }).int().positive('Choose a vendor'),
  date: isoDate,
  originalBillId: z.number().int().positive().nullable(),
  refNumber: z.string().max(100),
  taxRatePercent: decimalString,
  notes: z.string().max(4000),
  lines: z.array(LineSchema),
})

export type VendorCreditResult =
  | { ok: true; id: number; creditNumber: string }
  | { ok: false; error: string; field?: string }

function usableLines(lines: z.infer<typeof LineSchema>[]): PurchaseLineInput[] {
  return lines
    .filter(
      (line) =>
        line.itemId !== null ||
        line.accountId !== null ||
        line.description.trim() !== '' ||
        new Decimal(line.rate).greaterThan(0),
    )
    .map((line, index) => ({
      itemId: line.itemId,
      accountId: line.accountId,
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      lineOrder: index,
    }))
}

export async function saveVendorCredit(input: unknown): Promise<VendorCreditResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = VendorCreditSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the credit and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const data = parsed.data
  const lines = usableLines(data.lines)
  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one line with something on it.', field: 'lines' }
  }

  try {
    const credit = await issueVendorCredit(db, {
      vendorId: data.vendorId,
      date: parseDateInput(data.date),
      originalBillId: data.originalBillId,
      refNumber: data.refNumber,
      taxRate: new Decimal(data.taxRatePercent).dividedBy(100).toFixed(6),
      notes: data.notes,
      lines,
    })
    revalidatePath('/vendor-credits')
    revalidatePath(`/vendor-credits/${credit.id}`)
    revalidatePath(`/vendors/${data.vendorId}`)
    return { ok: true, id: credit.id, creditNumber: credit.creditNumber }
  } catch (error) {
    return { ok: false, error: describePurchasingFailure(error) }
  }
}

export async function applyVendorCreditAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({
      id: z.number().int().positive(),
      billId: z.number({ error: 'Choose a bill' }).int().positive('Choose a bill'),
      amount: decimalString,
    })
    .safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Check the amount and try again.' }
  }
  try {
    await applyVendorCredit(db, parsed.data.id, parsed.data.billId, parsed.data.amount)
    revalidatePath('/vendor-credits')
    revalidatePath(`/vendor-credits/${parsed.data.id}`)
    revalidatePath('/bills')
    revalidatePath(`/bills/${parsed.data.billId}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}

export async function voidVendorCreditAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That credit could not be identified.' }
  try {
    await voidVendorCredit(db, parsed.data.id)
    revalidatePath('/vendor-credits')
    revalidatePath(`/vendor-credits/${parsed.data.id}`)
    revalidatePath('/bills')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}
