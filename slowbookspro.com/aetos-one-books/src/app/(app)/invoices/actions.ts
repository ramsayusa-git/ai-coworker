'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  createInvoice,
  describeSalesFailure,
  duplicateInvoice,
  parseDateInput,
  sendInvoice,
  updateInvoice,
  voidInvoice,
  writeOffInvoice,
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

export const InvoiceDocumentSchema = z.object({
  customerId: z.number({ error: 'Choose a customer' }).int().positive('Choose a customer'),
  date: isoDate,
  dueDate: z.union([isoDate, z.literal('')]),
  terms: z.string().max(50),
  poNumber: z.string().max(100),
  taxRatePercent: decimalString,
  notes: z.string().max(4000),
  lines: z.array(LineSchema),
})

export type InvoiceActionResult =
  | { ok: true; id: number; invoiceNumber: string }
  | { ok: false; error: string; field?: string }

/** A line the person started but never filled in is dropped, not rejected. */
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

export async function saveInvoice(input: unknown): Promise<InvoiceActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: InvoiceDocumentSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the invoice and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const { id, data } = parsed.data
  const lines = usableLines(data.lines)
  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one line with something on it.', field: 'lines' }
  }

  const payload = {
    customerId: data.customerId,
    date: parseDateInput(data.date),
    dueDate: data.dueDate ? parseDateInput(data.dueDate) : null,
    terms: data.terms,
    poNumber: data.poNumber,
    // The form asks for a percentage; the ledger stores a fraction.
    taxRate: new Decimal(data.taxRatePercent).dividedBy(100).toFixed(6),
    notes: data.notes,
    lines,
  }

  try {
    const invoice = id ? await updateInvoice(db, id, payload) : await createInvoice(db, payload)
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoice.id}`)
    revalidatePath(`/customers/${data.customerId}`)
    return { ok: true, id: invoice.id, invoiceNumber: invoice.invoiceNumber }
  } catch (error) {
    return { ok: false, error: describeSalesFailure(error) }
  }
}

const idOnly = z.object({ id: z.number().int().positive() })

export async function sendInvoiceAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = idOnly.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That invoice could not be identified.' }
  try {
    await sendInvoice(db, parsed.data.id)
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export async function voidInvoiceAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = idOnly.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That invoice could not be identified.' }
  try {
    await voidInvoice(db, parsed.data.id)
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export async function duplicateInvoiceAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = idOnly.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That invoice could not be identified.' }
  try {
    const copy = await duplicateInvoice(db, parsed.data.id)
    revalidatePath('/invoices')
    return { ok: true as const, id: copy.id, invoiceNumber: copy.invoiceNumber }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export async function writeOffInvoiceAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'ADMIN')
  const parsed = z
    .object({ id: z.number().int().positive(), date: isoDate, amount: decimalString, memo: z.string().max(500) })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Check the write-off details and try again.' }

  try {
    await writeOffInvoice(db, parsed.data.id, {
      date: parseDateInput(parsed.data.date),
      amount: parsed.data.amount === '0' ? null : parsed.data.amount,
      memo: parsed.data.memo,
    })
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${parsed.data.id}`)
    revalidatePath('/credit-memos')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}
