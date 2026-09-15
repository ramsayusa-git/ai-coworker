'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { parseDateInput } from '@/server/sales'
import { describePurchasingFailure, payBills, voidBillPayment } from '@/server/purchasing'

const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

const PayBillsSchema = z.object({
  vendorId: z.number({ error: 'Choose a vendor' }).int().positive('Choose a vendor'),
  date: isoDate,
  payFromAccountId: z.number({ error: 'Choose an account' }).int().positive('Choose an account'),
  method: z.string().max(50),
  checkNumber: z.string().max(50),
  notes: z.string().max(4000),
  allocations: z.array(
    z.object({ billId: z.number().int().positive(), amount: decimalString }),
  ),
  credits: z.array(
    z.object({
      vendorCreditId: z.number().int().positive(),
      billId: z.number().int().positive(),
      amount: decimalString,
    }),
  ),
})

export type PayBillsResult =
  | { ok: true; id: number | null }
  | { ok: false; error: string; field?: string }

export async function payBillsAction(input: unknown): Promise<PayBillsResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = PayBillsSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the payment and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const data = parsed.data
  try {
    const result = await payBills(db, {
      vendorId: data.vendorId,
      date: parseDateInput(data.date),
      payFromAccountId: data.payFromAccountId,
      method: data.method,
      checkNumber: data.checkNumber,
      notes: data.notes,
      allocations: data.allocations,
      credits: data.credits,
    })
    revalidatePath('/bill-payments')
    revalidatePath('/bills')
    revalidatePath(`/vendors/${data.vendorId}`)
    revalidatePath('/vendor-credits')
    return { ok: true, id: result.id }
  } catch (error) {
    return { ok: false, error: describePurchasingFailure(error) }
  }
}

export async function voidBillPaymentAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That payment could not be identified.' }
  try {
    await voidBillPayment(db, parsed.data.id)
    revalidatePath('/bill-payments')
    revalidatePath(`/bill-payments/${parsed.data.id}`)
    revalidatePath('/bills')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}
