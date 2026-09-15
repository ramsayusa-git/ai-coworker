'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  describeSalesFailure,
  openInvoices,
  parseDateInput,
  receivePayment,
  voidPayment,
} from '@/server/sales'

const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

const PaymentSchema = z.object({
  customerId: z.number({ error: 'Choose a customer' }).int().positive('Choose a customer'),
  date: isoDate,
  amount: decimalString,
  method: z.string().max(50),
  checkNumber: z.string().max(50),
  reference: z.string().max(100),
  depositToAccountId: z.number().int().positive().nullable(),
  notes: z.string().max(4000),
  allocations: z.array(
    z.object({ invoiceId: z.number().int().positive(), amount: decimalString }),
  ),
})

export type PaymentActionResult =
  | { ok: true; id: number; unapplied: string }
  | { ok: false; error: string; field?: string }

export async function savePayment(input: unknown): Promise<PaymentActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = PaymentSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the payment and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const data = parsed.data
  const allocations = data.allocations.filter((line) => Number(line.amount) > 0)

  try {
    const payment = await receivePayment(db, {
      customerId: data.customerId,
      date: parseDateInput(data.date),
      amount: data.amount,
      method: data.method,
      checkNumber: data.checkNumber,
      reference: data.reference,
      depositToAccountId: data.depositToAccountId,
      notes: data.notes,
      allocations,
      // The form shows exactly what will be applied, so an empty list is a
      // deliberate prepayment rather than an invitation to guess.
      autoApply: false,
    })
    revalidatePath('/payments')
    revalidatePath('/invoices')
    revalidatePath(`/customers/${data.customerId}`)
    return { ok: true, id: payment.id, unapplied: payment.unapplied.toFixed(2) }
  } catch (error) {
    return { ok: false, error: describeSalesFailure(error) }
  }
}

export async function voidPaymentAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That payment could not be identified.' }

  try {
    await voidPayment(db, parsed.data.id)
    revalidatePath('/payments')
    revalidatePath(`/payments/${parsed.data.id}`)
    revalidatePath('/invoices')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export type OpenInvoiceOption = {
  id: number
  invoiceNumber: string
  date: string
  dueDate: string | null
  total: string
  balanceDue: string
}

/**
 * The customer's open invoices, for the allocation grid. Reading is read-only
 * and scoped to the caller's own tenant client, so it needs no role beyond the
 * session the context already proved.
 */
export async function openInvoicesForCustomer(input: unknown): Promise<OpenInvoiceOption[]> {
  const { db } = await getAppContext()
  const parsed = z.object({ customerId: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return []

  const invoices = await openInvoices(db, parsed.data.customerId)
  return invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
    total: invoice.total.toString(),
    balanceDue: invoice.balanceDue.toString(),
  }))
}
