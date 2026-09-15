'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { parseDateInput } from '@/server/sales'
import {
  convertPurchaseOrderToBill,
  createPurchaseOrder,
  describePurchasingFailure,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
  updatePurchaseOrder,
  type PurchaseLineInput,
} from '@/server/purchasing'

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
})

export const PurchaseOrderSchema = z.object({
  vendorId: z.number({ error: 'Choose a vendor' }).int().positive('Choose a vendor'),
  date: isoDate,
  expectedDate: z.union([isoDate, z.literal('')]),
  shipTo: z.string().max(2000),
  taxRatePercent: decimalString,
  notes: z.string().max(4000),
  lines: z.array(LineSchema),
})

export type PurchaseOrderResult =
  | { ok: true; id: number; poNumber: string }
  | { ok: false; error: string; field?: string }

function usableLines(lines: z.infer<typeof LineSchema>[]): PurchaseLineInput[] {
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
      lineOrder: index,
    }))
}

export async function savePurchaseOrder(input: unknown): Promise<PurchaseOrderResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: PurchaseOrderSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the purchase order and try again.',
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
    date: parseDateInput(data.date),
    expectedDate: data.expectedDate ? parseDateInput(data.expectedDate) : null,
    shipTo: data.shipTo,
    taxRate: new Decimal(data.taxRatePercent).dividedBy(100).toFixed(6),
    notes: data.notes,
    lines,
  }

  try {
    const po = id
      ? await updatePurchaseOrder(db, id, payload)
      : await createPurchaseOrder(db, payload)
    revalidatePath('/purchase-orders')
    revalidatePath(`/purchase-orders/${po.id}`)
    return { ok: true, id: po.id, poNumber: po.poNumber }
  } catch (error) {
    return { ok: false, error: describePurchasingFailure(error) }
  }
}

export async function setPurchaseOrderStatusAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({ id: z.number().int().positive(), status: z.enum(['DRAFT', 'SENT', 'CLOSED']) })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That order could not be identified.' }
  try {
    await setPurchaseOrderStatus(db, parsed.data.id, parsed.data.status)
    revalidatePath('/purchase-orders')
    revalidatePath(`/purchase-orders/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}

export async function receivePurchaseOrderAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({
      id: z.number().int().positive(),
      lines: z.array(z.object({ lineId: z.number().int().positive(), quantity: decimalString })),
    })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Check the quantities and try again.' }
  try {
    await receivePurchaseOrder(db, parsed.data.id, parsed.data.lines)
    revalidatePath('/purchase-orders')
    revalidatePath(`/purchase-orders/${parsed.data.id}`)
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}

export async function convertPurchaseOrderAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({
      id: z.number().int().positive(),
      date: z.union([isoDate, z.literal('')]).optional(),
      billNumber: z.string().max(100).optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'That order could not be identified.' }
  try {
    const bill = await convertPurchaseOrderToBill(db, parsed.data.id, {
      date: parsed.data.date ? parseDateInput(parsed.data.date) : undefined,
      billNumber: parsed.data.billNumber,
    })
    revalidatePath('/purchase-orders')
    revalidatePath(`/purchase-orders/${parsed.data.id}`)
    revalidatePath('/bills')
    return { ok: true as const, billId: bill.id, billNumber: bill.billNumber }
  } catch (error) {
    return { ok: false as const, error: describePurchasingFailure(error) }
  }
}
