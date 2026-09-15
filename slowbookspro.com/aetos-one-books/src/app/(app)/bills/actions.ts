'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { parseDateInput } from '@/server/sales'
import {
  createBill,
  describePurchasingFailure,
  updateBill,
  voidBill,
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

export const BillDocumentSchema = z.object({
  vendorId: z.number({ error: 'Choose a vendor' }).int().positive('Choose a vendor'),
  billNumber: z.string().max(100),
  date: isoDate,
  dueDate: z.union([isoDate, z.literal('')]),
  terms: z.string().max(50),
  refNumber: z.string().max(100),
  taxRatePercent: decimalString,
  notes: z.string().max(4000),
  lines: z.array(LineSchema),
})

export type BillActionResult =
  | { ok: true; id: number; billNumber: string }
  | { ok: false; error: string; field?: string }

/** A line the person started but never filled in is dropped, not rejected. */
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

export async function saveBill(input: unknown): Promise<BillActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: BillDocumentSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the bill and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const { id, data } = parsed.data
  const lines = usableLines(data.lines)
  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one line with something on it.', field: 'lines' }
  }

  const payload = {
    vendorId: data.vendorId,
    billNumber: data.billNumber,
    date: parseDateInput(data.date),
    dueDate: data.dueDate ? parseDateInput(data.dueDate) : null,
    terms: data.terms,
    refNumber: data.refNumber,
    // The form asks for a percentage; the ledger stores a fraction.
    taxRate: new Decimal(data.taxRatePercent).dividedBy(100).toFixed(6),
    notes: data.notes,
    lines,
  }

  try {
    const bill = id ? await updateBill(db, id, payload) : await createBill(db, payload)
    revalidatePath('/bills')
    revalidatePath(`/bills/${bill.id}`)
    revalidatePath(`/vendors/${data.vendorId}`)
    return { ok: true, id: bill.id, billNumber: bill.billNumber }
  } catch (error) {
    return { ok: false, error: describePurchasingFailure(error) }
  }
}

const idOnly = z.object({ id: z.number().int().positive() })

export async function voidBillAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = idOnly.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That bill could not be identified.' }
  try {
    await voidBill(db, parsed.data.id)
    revalidatePath('/bills')
    revalidatePath(`/bills/${parsed.data.id}`)
    revalidatePath('/vendors')
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}
