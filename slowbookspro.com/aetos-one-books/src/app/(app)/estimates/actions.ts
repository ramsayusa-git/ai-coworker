'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import {
  convertEstimate,
  createEstimate,
  describeSalesFailure,
  parseDateInput,
  setEstimateStatus,
  updateEstimate,
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

const EstimateDocumentSchema = z.object({
  customerId: z.number({ error: 'Choose a customer' }).int().positive('Choose a customer'),
  date: isoDate,
  expirationDate: z.union([isoDate, z.literal('')]),
  taxRatePercent: decimalString,
  notes: z.string().max(4000),
  lines: z.array(LineSchema),
})

export type EstimateActionResult =
  | { ok: true; id: number; estimateNumber: string }
  | { ok: false; error: string; field?: string }

function usableLines(lines: z.infer<typeof LineSchema>[]): SalesLineInput[] {
  return lines
    .filter(
      (line) =>
        line.itemId !== null || line.description.trim() !== '' || new Decimal(line.rate).greaterThan(0),
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

export async function saveEstimate(input: unknown): Promise<EstimateActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: EstimateDocumentSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the estimate and try again.',
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
    expirationDate: data.expirationDate ? parseDateInput(data.expirationDate) : null,
    taxRate: new Decimal(data.taxRatePercent).dividedBy(100).toFixed(6),
    notes: data.notes,
    lines,
  }

  try {
    const estimate = id ? await updateEstimate(db, id, payload) : await createEstimate(db, payload)
    revalidatePath('/estimates')
    revalidatePath(`/estimates/${estimate.id}`)
    return { ok: true, id: estimate.id, estimateNumber: estimate.estimateNumber }
  } catch (error) {
    return { ok: false, error: describeSalesFailure(error) }
  }
}

export async function setEstimateStatusAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({ id: z.number().int().positive(), status: z.enum(['ACCEPTED', 'REJECTED', 'PENDING']) })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That estimate could not be identified.' }

  try {
    await setEstimateStatus(db, parsed.data.id, parsed.data.status)
    revalidatePath('/estimates')
    revalidatePath(`/estimates/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}

export async function convertEstimateAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That estimate could not be identified.' }

  try {
    const invoice = await convertEstimate(db, parsed.data.id)
    revalidatePath('/estimates')
    revalidatePath(`/estimates/${parsed.data.id}`)
    revalidatePath('/invoices')
    return { ok: true as const, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }
  } catch (error) {
    return { ok: false as const, error: describeSalesFailure(error) }
  }
}
