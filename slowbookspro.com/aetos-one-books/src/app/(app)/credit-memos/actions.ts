'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  applyCreditMemo,
  describeSalesFailure,
  issueCreditMemo,
  openInvoices,
  parseDateInput,
  voidCreditMemo,
  type SalesLineInput,
} from '@/server/sales'

const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

const LineSchema = z.object({
  itemId: z.number().int().positive().nullable(),
  description: z.string().max(2000),
  quantity: decimalString,
  rate: decimalString,
  isTaxable: z.boolean(),
})

const CreditMemoSchema = z.object({
  customerId: z.number({ error: 'Choose a customer' }).int().positive('Choose a customer'),
  date: isoDate,
  originalInvoiceId: z.number().int().positive().nullable(),
  taxRatePercent: decimalString,
  notes: z.string().max(4000),
  lines: z.array(LineSchema),
})

export type CreditMemoActionResult =
  | { ok: true; id: number; memoNumber: string }
  | { ok: false; error: string; field?: string }

function usableLines(lines: z.infer<typeof LineSchema>[]): SalesLineInput[] {
  return lines
    .filter(
      (line) =>
        line.itemId !== null ||
        line.description.trim() !== '' ||
        new Decimal(line.rate).greaterThan(0),
    )
    .map((line, index) => ({
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      isTaxable: line.isTaxable,
      lineOrder: index,
    }))
}

export async function issueCreditMemoAction(input: unknown): Promise<CreditMemoActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = CreditMemoSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the credit memo and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const data = parsed.data
  const lines = usableLines(data.lines)
  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one line with something on it.', field: 'lines' }
  }

  try {
    const memo = await issueCreditMemo(db, {
      customerId: data.customerId,
      date: parseDateInput(data.date),
      originalInvoiceId: data.originalInvoiceId,
      // The form asks for a percentage; the ledger stores a fraction.
      taxRate: new Decimal(data.taxRatePercent).dividedBy(100).toFixed(6),
      notes: data.notes,
      lines,
    })
    revalidatePath('/credit-memos')
    revalidatePath(`/credit-memos/${memo.id}`)
    revalidatePath(`/customers/${data.customerId}`)
    return { ok: true, id: memo.id, memoNumber: memo.memoNumber }
  } catch (error) {
    return { ok: false, error: describeSalesFailure(error) }
  }
}

export async function applyCreditMemoAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({
      memoId: z.number().int().positive(),
      invoiceId: z.number({ error: 'Choose an invoice' }).int().positive('Choose an invoice'),
      amount: decimalString,
    })
    .safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Check the details.' }
  }

  try {
    const result = await applyCreditMemo(
      db,
      parsed.data.memoId,
      parsed.data.invoiceId,
      parsed.data.amount,
    )
    revalidatePath('/credit-memos')
    revalidatePath(`/credit-memos/${parsed.data.memoId}`)
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${parsed.data.invoiceId}`)
    return { ok: true as const, invoiceNumber: result.invoiceNumber }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export async function voidCreditMemoAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: 'That credit memo could not be identified.' }
  }

  try {
    await voidCreditMemo(db, parsed.data.id)
    revalidatePath('/credit-memos')
    revalidatePath(`/credit-memos/${parsed.data.id}`)
    revalidatePath('/invoices')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export type ApplicableInvoice = {
  id: number
  invoiceNumber: string
  date: string
  balanceDue: string
}

/** The customer's still-open invoices, for the apply dialog. */
export async function applicableInvoices(input: unknown): Promise<ApplicableInvoice[]> {
  const { db } = await getAppContext()
  const parsed = z.object({ customerId: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return []
  const invoices = await openInvoices(db, parsed.data.customerId)
  return invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date.toISOString().slice(0, 10),
    balanceDue: invoice.balanceDue.toString(),
  }))
}
