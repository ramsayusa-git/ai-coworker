import 'server-only'
import { Decimal } from 'decimal.js'
import { cents, money, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import {
  DepreciationMethod,
  FixedAssetStatus,
  type FixedAsset,
  type FixedAssetType,
  type Prisma,
} from '@/generated/tenant/client'
import { assertPostable, ClosedPeriodError, postJournalEntry, UnbalancedEntryError, type JournalLine } from './ledger'
import { ForbiddenError } from '@/lib/rbac'
import { CONTROL_ACCOUNTS, controlAccountId } from './seed-tenant'
import { startOfToday } from './sales'

/**
 * The fixed-asset register and its depreciation.
 *
 * An asset is bought like anything else (a bill or an expense debiting 1500);
 * this module owns what happens afterwards — the monthly write-down and the
 * eventual disposal.
 *
 *   depreciation   DR 6600 Depreciation Expense / CR 1590 Accumulated Depreciation
 *   disposal       DR cash received, DR the accumulated depreciation taken,
 *                  CR 1500 at cost, and the difference lands in gain or loss.
 *
 * Book value is derived (`cost − accumulated`), never stored, and depreciation
 * never takes it below the salvage value. One journal entry per asset per run,
 * so drill-down from the ledger lands on a single asset.
 */

type Tx = Prisma.TransactionClient
const asClient = (tx: Tx): TenantClient => tx as unknown as TenantClient

export class AssetError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = 'AssetError'
  }
}

const nullable = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AssetAccounts = {
  asset: number
  accumulated: number
  expense: number
  disposal: number
  checking: number
}

const DISPOSAL_ACCOUNT_NUMBER = '7100'
const DISPOSAL_ACCOUNT_NAME = 'Gain or Loss on Asset Disposal'

/**
 * The disposal account is not part of the seeded chart — most companies never
 * dispose of anything — so it is created the first time one is needed rather
 * than cluttering every new environment.
 */
async function disposalAccountId(db: TenantClient): Promise<number> {
  const existing =
    (await db.account.findFirst({ where: { accountNumber: DISPOSAL_ACCOUNT_NUMBER } })) ??
    (await db.account.findFirst({ where: { name: DISPOSAL_ACCOUNT_NAME } }))
  if (existing) return existing.id

  const numberTaken = await db.account.count({ where: { accountNumber: DISPOSAL_ACCOUNT_NUMBER } })
  const created = await db.account.create({
    data: {
      accountNumber: numberTaken > 0 ? null : DISPOSAL_ACCOUNT_NUMBER,
      name: DISPOSAL_ACCOUNT_NAME,
      accountType: 'EXPENSE',
      description: 'Difference between proceeds and book value when an asset leaves the register',
      isSystem: true,
      isActive: true,
    },
  })
  return created.id
}

export async function assetAccounts(db: TenantClient): Promise<AssetAccounts> {
  const [asset, accumulated, expense, checking, disposal] = await Promise.all([
    controlAccountId(db, CONTROL_ACCOUNTS.FIXED_ASSETS),
    controlAccountId(db, CONTROL_ACCOUNTS.ACCUM_DEPRECIATION),
    controlAccountId(db, CONTROL_ACCOUNTS.DEPRECIATION),
    controlAccountId(db, CONTROL_ACCOUNTS.CHECKING),
    disposalAccountId(db),
  ])
  return { asset, accumulated, expense, checking, disposal }
}

/** A type may map its own accounts; where it does not, the control accounts stand in. */
function accountsForType(type: FixedAssetType, fallback: AssetAccounts) {
  return {
    asset: type.assetAccountId ?? fallback.asset,
    accumulated: type.accumulatedDepreciationAccountId ?? fallback.accumulated,
    expense: type.depreciationExpenseAccountId ?? fallback.expense,
  }
}

// ---------------------------------------------------------------------------
// Asset types
// ---------------------------------------------------------------------------

export type AssetTypeInput = {
  name: string
  description?: string | null
  assetAccountId?: number | null
  accumulatedDepreciationAccountId?: number | null
  depreciationExpenseAccountId?: number | null
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
  /** Straight line only: how many years the asset is expected to earn its keep. */
  effectiveLifeYears?: Decimal.Value | null
  /** Declining balance only: the annual rate as a fraction (0.2 = 20% a year). */
  annualRate?: Decimal.Value | null
  isActive?: boolean
}

function assetTypeData(input: AssetTypeInput) {
  const method = DepreciationMethod[input.depreciationMethod]
  const life = input.effectiveLifeYears == null ? null : money(input.effectiveLifeYears)
  const rate = input.annualRate == null ? null : money(input.annualRate)

  if (method === DepreciationMethod.STRAIGHT_LINE) {
    if (!life || !life.greaterThan(0)) {
      throw new AssetError('A straight-line type needs an effective life in years.')
    }
  } else if (!rate || !rate.greaterThan(0)) {
    throw new AssetError('A declining-balance type needs an annual rate (0.2 = 20% a year).')
  }
  if (rate && rate.greaterThan(1)) {
    throw new AssetError('The annual rate is a fraction (0.2 = 20%). Divide the percentage by 100.')
  }

  return {
    name: input.name.trim(),
    description: nullable(input.description),
    assetAccountId: input.assetAccountId ?? null,
    accumulatedDepreciationAccountId: input.accumulatedDepreciationAccountId ?? null,
    depreciationExpenseAccountId: input.depreciationExpenseAccountId ?? null,
    depreciationMethod: method,
    // The method that is not in use keeps a null, so a run can never read the
    // wrong number off a type that was switched over.
    effectiveLifeYears: method === DepreciationMethod.STRAIGHT_LINE ? life!.toFixed(4) : null,
    annualRate: method === DepreciationMethod.DECLINING_BALANCE ? rate!.toFixed(4) : null,
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  }
}

export async function createAssetType(db: TenantClient, input: AssetTypeInput) {
  const name = input.name.trim()
  if (name === '') throw new AssetError('Give the type a name.')
  const clash = await db.fixedAssetType.findFirst({ where: { name } })
  if (clash) throw new AssetError('An asset type with that name already exists.', 409)
  return db.fixedAssetType.create({ data: assetTypeData(input) })
}

export async function updateAssetType(db: TenantClient, id: number, input: AssetTypeInput) {
  const existing = await db.fixedAssetType.findUnique({ where: { id } })
  if (!existing) throw new AssetError('Asset type not found.', 404)
  return db.fixedAssetType.update({ where: { id }, data: assetTypeData(input) })
}

/**
 * A company with no types at all gets one, so the register is usable the first
 * time it is opened. Idempotent: it returns what is already there.
 */
export async function ensureDefaultAssetType(db: TenantClient) {
  const existing = await db.fixedAssetType.findMany({ orderBy: { name: 'asc' } })
  if (existing.length > 0) return existing

  const accounts = await assetAccounts(db)
  await db.fixedAssetType.create({
    data: {
      name: 'Equipment',
      description: 'General equipment, straight line over five years',
      assetAccountId: accounts.asset,
      accumulatedDepreciationAccountId: accounts.accumulated,
      depreciationExpenseAccountId: accounts.expense,
      depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
      effectiveLifeYears: '5.0000',
    },
  })
  return db.fixedAssetType.findMany({ orderBy: { name: 'asc' } })
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export type AssetInput = {
  name: string
  assetTypeId: number
  purchaseDate: Date
  purchasePrice: Decimal.Value
  salvageValue?: Decimal.Value
  description?: string | null
}

async function nextAssetNumber(tx: TenantClient) {
  let n = (await tx.fixedAsset.count()) + 1
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `FA-${String(n).padStart(4, '0')}`
    if ((await tx.fixedAsset.count({ where: { assetNumber: candidate } })) === 0) return candidate
    n += 1
  }
  throw new AssetError('Could not assign an asset number — please retry.', 503)
}

function assertAssetAmounts(price: Decimal, salvage: Decimal) {
  if (price.isNegative()) throw new AssetError('A purchase price cannot be negative.')
  if (salvage.isNegative()) throw new AssetError('A salvage value cannot be negative.')
  if (salvage.greaterThan(price)) {
    throw new AssetError('The salvage value cannot be more than the purchase price.')
  }
}

/**
 * Register an asset. Registering posts nothing: the money already moved when
 * the bill or the expense that bought it was entered.
 */
export async function registerAsset(db: TenantClient, input: AssetInput) {
  const type = await db.fixedAssetType.findUnique({ where: { id: input.assetTypeId } })
  if (!type) throw new AssetError('Asset type not found.', 404)

  const price = cents(input.purchasePrice)
  const salvage = cents(input.salvageValue ?? 0)
  assertAssetAmounts(price, salvage)
  if (input.name.trim() === '') throw new AssetError('Give the asset a name.')

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const assetNumber = await nextAssetNumber(tx)
    const asset = await tx.fixedAsset.create({
      data: {
        assetNumber,
        name: input.name.trim(),
        assetTypeId: type.id,
        status: FixedAssetStatus.REGISTERED,
        purchaseDate: input.purchaseDate,
        purchasePrice: price.toFixed(2),
        salvageValue: salvage.toFixed(2),
        description: nullable(input.description),
      },
    })
    return { id: asset.id, assetNumber }
  })
}

export async function updateAsset(db: TenantClient, id: number, input: AssetInput) {
  const existing = await db.fixedAsset.findUnique({ where: { id } })
  if (!existing) throw new AssetError('Asset not found.', 404)
  if (existing.status === FixedAssetStatus.DISPOSED) {
    throw new AssetError('A disposed asset is read-only.')
  }
  const type = await db.fixedAssetType.findUnique({ where: { id: input.assetTypeId } })
  if (!type) throw new AssetError('Asset type not found.', 404)

  const price = cents(input.purchasePrice)
  const salvage = cents(input.salvageValue ?? 0)
  assertAssetAmounts(price, salvage)

  const accumulated = money(existing.accumulatedDepreciation.toString())
  if (accumulated.greaterThan(price.minus(salvage))) {
    throw new AssetError(
      `${accumulated.toFixed(2)} of depreciation has already been posted against this asset. A cost or salvage change cannot take the depreciable amount below it.`,
    )
  }

  // Accumulated depreciation and the last run date belong to the runs, never
  // to a form.
  return db.fixedAsset.update({
    where: { id },
    data: {
      name: input.name.trim(),
      assetTypeId: type.id,
      purchaseDate: input.purchaseDate,
      purchasePrice: price.toFixed(2),
      salvageValue: salvage.toFixed(2),
      description: nullable(input.description),
    },
  })
}

/** Cost less the depreciation taken so far. Always derived. */
export const bookValue = (asset: Pick<FixedAsset, 'purchasePrice' | 'accumulatedDepreciation'>) =>
  cents(money(asset.purchasePrice.toString()).minus(money(asset.accumulatedDepreciation.toString())))

/** Whole months from one date to another; a part month does not count. */
export function fullMonthsBetween(start: Date, end: Date): number {
  if (end <= start) return 0
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  if (end.getUTCDate() < start.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/** One month's write-down under the type's method, before any clamping. */
function monthlyCharge(asset: FixedAsset, type: FixedAssetType): Decimal {
  const cost = money(asset.purchasePrice.toString())
  const salvage = money(asset.salvageValue.toString())

  if (type.depreciationMethod === DepreciationMethod.STRAIGHT_LINE) {
    const life = money(type.effectiveLifeYears?.toString() ?? 0)
    if (!life.greaterThan(0)) {
      throw new AssetError(`Asset type "${type.name}" has no effective life set.`)
    }
    return cost.minus(salvage).dividedBy(life.times(12))
  }

  const rate = money(type.annualRate?.toString() ?? 0)
  if (!rate.greaterThan(0)) {
    throw new AssetError(`Asset type "${type.name}" has no annual rate set.`)
  }
  return bookValue(asset).times(rate).dividedBy(12)
}

/**
 * What this asset owes the ledger as at `runDate`: whole months since the last
 * run (or since purchase), never more than what is left above salvage.
 */
export function periodDepreciation(asset: FixedAsset, type: FixedAssetType, runDate: Date): Decimal {
  if (asset.status !== FixedAssetStatus.REGISTERED) return ZERO
  const start = asset.lastDepreciationDate ?? asset.purchaseDate
  const months = fullMonthsBetween(start, runDate)
  if (months <= 0) return ZERO

  const remaining = cents(bookValue(asset).minus(money(asset.salvageValue.toString())))
  if (!remaining.greaterThan(0)) return ZERO

  const charge = cents(monthlyCharge(asset, type).times(months))
  return Decimal.min(charge, remaining)
}

export type ScheduleRow = {
  period: number
  date: Date
  openingBookValue: Decimal
  charge: Decimal
  accumulated: Decimal
  closingBookValue: Decimal
}

/**
 * The whole life of an asset, month by month, from its purchase date. A
 * projection for the detail page — nothing here posts.
 */
export function depreciationSchedule(
  asset: FixedAsset,
  type: FixedAssetType,
  opts: { maxPeriods?: number } = {},
): ScheduleRow[] {
  const cost = money(asset.purchasePrice.toString())
  const salvage = money(asset.salvageValue.toString())
  const maxPeriods = opts.maxPeriods ?? 600

  const straightLine = type.depreciationMethod === DepreciationMethod.STRAIGHT_LINE
  const life = money(type.effectiveLifeYears?.toString() ?? 0)
  const rate = money(type.annualRate?.toString() ?? 0)
  if (straightLine && !life.greaterThan(0)) return []
  if (!straightLine && !rate.greaterThan(0)) return []

  const monthly = straightLine ? cost.minus(salvage).dividedBy(life.times(12)) : null
  const periods = straightLine ? Math.min(Math.ceil(life.times(12).toNumber()), maxPeriods) : maxPeriods

  const rows: ScheduleRow[] = []
  let accumulated = ZERO

  for (let period = 1; period <= periods; period += 1) {
    const opening = cents(cost.minus(accumulated))
    const remaining = cents(opening.minus(salvage))
    if (!remaining.greaterThan(0)) break

    // Declining balance charges a slice of the *current* book value, so each
    // month is smaller than the last and the tail is clipped at salvage.
    const raw = straightLine ? monthly! : opening.times(rate).dividedBy(12)
    const charge = Decimal.min(cents(raw), remaining)
    if (!charge.greaterThan(0)) break

    accumulated = cents(accumulated.plus(charge))
    const date = new Date(
      Date.UTC(
        asset.purchaseDate.getUTCFullYear(),
        asset.purchaseDate.getUTCMonth() + period,
        asset.purchaseDate.getUTCDate(),
      ),
    )
    rows.push({
      period,
      date,
      openingBookValue: opening,
      charge,
      accumulated,
      closingBookValue: cents(cost.minus(accumulated)),
    })
  }

  return rows
}

/**
 * Post depreciation for every registered asset up to `runDate`, one entry per
 * asset. Re-running for the same date is a no-op: no whole month has passed.
 */
export async function runDepreciation(db: TenantClient, runDate: Date) {
  await assertPostable(db, runDate)
  const fallback = await assetAccounts(db)
  const assets = await db.fixedAsset.findMany({
    where: { status: FixedAssetStatus.REGISTERED },
    include: { assetType: true },
    orderBy: { assetNumber: 'asc' },
  })

  let posted = 0
  let skipped = 0
  let total = ZERO
  const entries: { assetId: number; assetNumber: string; amount: Decimal }[] = []

  for (const asset of assets) {
    const amount = periodDepreciation(asset, asset.assetType, runDate)
    if (!amount.greaterThan(0)) {
      skipped += 1
      continue
    }
    const accounts = accountsForType(asset.assetType, fallback)

    await db.$transaction(async (raw) => {
      const tx = asClient(raw)
      await postJournalEntry(tx, {
        date: runDate,
        description: `Depreciation — ${asset.assetNumber} ${asset.name}`,
        reference: asset.assetNumber,
        sourceType: 'depreciation',
        sourceId: asset.id,
        lines: [
          {
            accountId: accounts.expense,
            debit: amount,
            description: `Depreciation ${asset.assetNumber}`,
          },
          {
            accountId: accounts.accumulated,
            credit: amount,
            description: `Accumulated depreciation ${asset.assetNumber}`,
          },
        ],
      })
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulatedDepreciation: cents(
            money(asset.accumulatedDepreciation.toString()).plus(amount),
          ).toFixed(2),
          lastDepreciationDate: runDate,
        },
      })
    })

    posted += 1
    total = total.plus(amount)
    entries.push({ assetId: asset.id, assetNumber: asset.assetNumber, amount })
  }

  return { posted, skipped, total: cents(total), entries }
}

/** What a run on this date would post, without posting it. */
export async function previewDepreciation(db: TenantClient, runDate: Date) {
  const assets = await db.fixedAsset.findMany({
    where: { status: FixedAssetStatus.REGISTERED },
    include: { assetType: true },
    orderBy: { assetNumber: 'asc' },
  })
  const rows = assets.map((asset) => {
    let amount = ZERO
    try {
      amount = periodDepreciation(asset, asset.assetType, runDate)
    } catch {
      // A type missing its life or rate cannot be projected; it shows as zero
      // here and refuses loudly when someone actually runs it.
      amount = ZERO
    }
    return { id: asset.id, assetNumber: asset.assetNumber, name: asset.name, amount }
  })
  return { rows: rows.filter((row) => row.amount.greaterThan(0)), total: cents(sum(rows.map((r) => r.amount))) }
}

/**
 * Take an asset off the books. Cash comes in, the accumulated depreciation is
 * derecognised, the cost is credited away, and whatever is left over is the
 * gain (credit) or the loss (debit).
 */
export async function disposeAsset(
  db: TenantClient,
  id: number,
  args: { disposalDate: Date; proceeds?: Decimal.Value; depositAccountId?: number | null },
) {
  const asset = await db.fixedAsset.findUnique({ where: { id }, include: { assetType: true } })
  if (!asset) throw new AssetError('Asset not found.', 404)
  if (asset.status === FixedAssetStatus.DISPOSED) throw new AssetError('This asset is already disposed.')
  await assertPostable(db, args.disposalDate)

  const fallback = await assetAccounts(db)
  const accounts = accountsForType(asset.assetType, fallback)
  const deposit = args.depositAccountId ?? fallback.checking

  const cost = cents(money(asset.purchasePrice.toString()))
  const accumulated = cents(money(asset.accumulatedDepreciation.toString()))
  const proceeds = cents(args.proceeds ?? 0)
  if (proceeds.isNegative()) throw new AssetError('Proceeds cannot be negative.')

  const residual = cents(proceeds.plus(accumulated).minus(cost))

  const lines: JournalLine[] = []
  if (proceeds.greaterThan(0)) {
    lines.push({
      accountId: deposit,
      debit: proceeds,
      description: `Disposal proceeds ${asset.assetNumber}`,
    })
  }
  if (accumulated.greaterThan(0)) {
    lines.push({
      accountId: accounts.accumulated,
      debit: accumulated,
      description: `Derecognise accumulated depreciation ${asset.assetNumber}`,
    })
  }
  lines.push({
    accountId: accounts.asset,
    credit: cost,
    description: `Derecognise cost ${asset.assetNumber}`,
  })
  if (!residual.isZero()) {
    lines.push({
      accountId: fallback.disposal,
      debit: residual.isNegative() ? residual.negated() : 0,
      credit: residual.greaterThan(0) ? residual : 0,
      description: `${residual.greaterThan(0) ? 'Gain' : 'Loss'} on disposal ${asset.assetNumber}`,
    })
  }

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const entry = await postJournalEntry(tx, {
      date: args.disposalDate,
      description: `Disposal — ${asset.assetNumber} ${asset.name}`,
      reference: asset.assetNumber,
      sourceType: 'asset_disposal',
      sourceId: asset.id,
      lines,
    })
    await tx.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: FixedAssetStatus.DISPOSED,
        disposalDate: args.disposalDate,
        disposalProceeds: proceeds.toFixed(2),
      },
    })
    return { id: asset.id, transactionId: entry.id, gainLoss: residual }
  })
}

/** Cost, depreciation and book value per type — the register's tie-out. */
export async function assetReconciliation(db: TenantClient) {
  const assets = await db.fixedAsset.findMany({
    where: { status: FixedAssetStatus.REGISTERED },
    include: { assetType: { select: { id: true, name: true } } },
  })

  const byType = new Map<
    number,
    { assetTypeId: number; assetType: string; count: number; cost: Decimal; accumulated: Decimal }
  >()
  for (const asset of assets) {
    const row =
      byType.get(asset.assetTypeId) ??
      {
        assetTypeId: asset.assetTypeId,
        assetType: asset.assetType.name,
        count: 0,
        cost: ZERO,
        accumulated: ZERO,
      }
    row.count += 1
    row.cost = row.cost.plus(money(asset.purchasePrice.toString()))
    row.accumulated = row.accumulated.plus(money(asset.accumulatedDepreciation.toString()))
    byType.set(asset.assetTypeId, row)
  }

  const rows = [...byType.values()]
    .map((row) => ({ ...row, bookValue: cents(row.cost.minus(row.accumulated)) }))
    .sort((a, b) => a.assetType.localeCompare(b.assetType))

  return {
    rows,
    totalCost: cents(sum(rows.map((r) => r.cost))),
    totalAccumulated: cents(sum(rows.map((r) => r.accumulated))),
    totalBookValue: cents(sum(rows.map((r) => r.bookValue))),
  }
}

export const assetToday = startOfToday

export function describeAssetFailure(error: unknown): string {
  if (error instanceof AssetError) return error.message
  if (error instanceof ClosedPeriodError) {
    return `${error.message}. Change the date, or ask an admin to move the closing date.`
  }
  if (error instanceof ForbiddenError) return error.message
  if (error instanceof UnbalancedEntryError) {
    return 'That entry does not balance. Check the cost, the depreciation taken and the proceeds.'
  }
  return 'Something went wrong saving this. Nothing was changed — please try again.'
}
