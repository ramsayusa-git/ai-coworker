'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { parseDateInput } from '@/server/sales'
import {
  createAssetType,
  describeAssetFailure,
  disposeAsset,
  registerAsset,
  runDepreciation,
  updateAsset,
  updateAssetType,
} from '@/server/fixed-assets'

const decimalString = z
  .string()
  .regex(/^-?\d*\.?\d*$/, 'Enter a number')
  .transform((value) => (value.trim() === '' ? '0' : value))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date')

const AssetSchema = z.object({
  name: z.string().trim().min(1, 'Give the asset a name').max(200),
  assetTypeId: z.number({ error: 'Choose a type' }).int().positive('Choose a type'),
  purchaseDate: isoDate,
  purchasePrice: decimalString,
  salvageValue: decimalString,
  description: z.string().max(4000),
})

export type AssetActionResult =
  | { ok: true; id: number }
  | { ok: false; error: string; field?: string }

export async function saveAsset(input: unknown): Promise<AssetActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: AssetSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the asset and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const { id, data } = parsed.data
  const payload = {
    name: data.name,
    assetTypeId: data.assetTypeId,
    purchaseDate: parseDateInput(data.purchaseDate),
    purchasePrice: data.purchasePrice,
    salvageValue: data.salvageValue,
    description: data.description,
  }

  try {
    const asset = id ? await updateAsset(db, id, payload) : await registerAsset(db, payload)
    revalidatePath('/fixed-assets')
    revalidatePath(`/fixed-assets/${asset.id}`)
    return { ok: true, id: asset.id }
  } catch (error) {
    return { ok: false, error: describeAssetFailure(error) }
  }
}

const AssetTypeSchema = z.object({
  name: z.string().trim().min(1, 'Give the type a name').max(120),
  description: z.string().max(4000),
  assetAccountId: z.number().int().positive().nullable(),
  accumulatedDepreciationAccountId: z.number().int().positive().nullable(),
  depreciationExpenseAccountId: z.number().int().positive().nullable(),
  depreciationMethod: z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE']),
  effectiveLifeYears: decimalString,
  annualRatePercent: decimalString,
})

export async function saveAssetType(input: unknown): Promise<AssetActionResult> {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'ADMIN')

  const parsed = z
    .object({ id: z.number().int().positive().nullable(), data: AssetTypeSchema })
    .safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the type and try again.',
      field: String(issue?.path.at(-1) ?? ''),
    }
  }

  const { id, data } = parsed.data
  const straightLine = data.depreciationMethod === 'STRAIGHT_LINE'
  const payload = {
    name: data.name,
    description: data.description,
    assetAccountId: data.assetAccountId,
    accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId,
    depreciationExpenseAccountId: data.depreciationExpenseAccountId,
    depreciationMethod: data.depreciationMethod,
    effectiveLifeYears: straightLine ? data.effectiveLifeYears : null,
    // The form asks for a percentage a year; the register stores a fraction.
    annualRate: straightLine ? null : (Number(data.annualRatePercent) / 100).toFixed(4),
  }

  try {
    const type = id ? await updateAssetType(db, id, payload) : await createAssetType(db, payload)
    revalidatePath('/fixed-assets')
    revalidatePath('/fixed-assets/types')
    return { ok: true, id: type.id }
  } catch (error) {
    return { ok: false, error: describeAssetFailure(error) }
  }
}

export async function runDepreciationAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z.object({ runDate: isoDate }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Enter a valid run date.' }
  try {
    const result = await runDepreciation(db, parseDateInput(parsed.data.runDate))
    revalidatePath('/fixed-assets')
    revalidatePath('/journal')
    return {
      ok: true as const,
      posted: result.posted,
      skipped: result.skipped,
      total: result.total.toFixed(2),
    }
  } catch (error) {
    return { ok: false as const, error: describeAssetFailure(error) }
  }
}

export async function disposeAssetAction(input: unknown) {
  const { db, session } = await getAppContext()
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const parsed = z
    .object({
      id: z.number().int().positive(),
      disposalDate: isoDate,
      proceeds: decimalString,
      depositAccountId: z.number().int().positive().nullable(),
    })
    .safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Check the disposal details and try again.' }
  try {
    const result = await disposeAsset(db, parsed.data.id, {
      disposalDate: parseDateInput(parsed.data.disposalDate),
      proceeds: parsed.data.proceeds,
      depositAccountId: parsed.data.depositAccountId,
    })
    revalidatePath('/fixed-assets')
    revalidatePath(`/fixed-assets/${parsed.data.id}`)
    return { ok: true as const, gainLoss: result.gainLoss.toFixed(2) }
  } catch (error) {
    return { ok: false as const, error: describeAssetFailure(error) }
  }
}
