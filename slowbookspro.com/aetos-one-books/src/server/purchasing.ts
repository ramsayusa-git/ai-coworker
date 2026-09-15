import 'server-only'
import { Decimal } from 'decimal.js'
import { cents, extend, money, qty as quantizeQty, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import {
  BillStatus,
  InventoryMovementType,
  PoStatus,
  VendorCreditStatus,
  type Prisma,
} from '@/generated/tenant/client'
import {
  assertPostable,
  ClosedPeriodError,
  postJournalEntry,
  reverseTransaction,
  UnbalancedEntryError,
  type JournalLine,
} from './ledger'
import { ForbiddenError } from '@/lib/rbac'
import { CONTROL_ACCOUNTS, controlAccountId } from './seed-tenant'
import { recordMovement, UnknownItemError } from './inventory'
import { dueDateFromTerms, startOfToday } from './sales'

/**
 * Purchasing and accounts payable: vendors, bills, bill payments, purchase
 * orders, vendor credits, and the two ledger-only documents (an expense and a
 * credit-card charge).
 *
 * It follows the same three rules as the sales side.
 *
 *  1. **Round per line, then sum.** `priceDocument`-style extension: a line is
 *     rounded to cents before it is added to anything.
 *  2. **A document and its GL effect commit together.** Every mutation that
 *     posts runs inside one `db.$transaction` and goes through
 *     `postJournalEntry` — never a direct write to transaction lines.
 *  3. **Posted history is append-only.** An edit or a void reverses the old
 *     entry through `reverseTransaction` and, when the document survives, posts
 *     a fresh one.
 *
 * The postings, in one table:
 *
 * | document              | debit                                   | credit                       |
 * |-----------------------|-----------------------------------------|------------------------------|
 * | bill                  | expense per line, or 1300 for stock      | 2000 Accounts Payable        |
 * | bill payment          | 2000 Accounts Payable                    | the bank or card paid from   |
 * | vendor credit         | 2000 Accounts Payable                    | expense per line, or 1300    |
 * | expense               | the expense account                      | the bank/card paid from      |
 * | credit-card charge    | the expense account                      | 2100 Credit Card             |
 * | purchase order        | — nothing: a PO is not a financial event —                              |
 * | credit application    | — nothing: A/P moved when the credit was issued —                       |
 *
 * Expected failures throw `PurchasingError`; the server actions turn them into
 * a message beside the field.
 */

type Tx = Prisma.TransactionClient
/** Inside an interactive transaction Prisma hands back a narrower client. */
const asClient = (tx: Tx): TenantClient => tx as unknown as TenantClient

export class PurchasingError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = 'PurchasingError'
  }
}

const nullable = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

// ---------------------------------------------------------------------------
// Control accounts
// ---------------------------------------------------------------------------

export type PurchasingAccounts = {
  payable: number
  inventory: number
  salesTax: number
  checking: number
  creditCard: number
  /**
   * Where a bill line lands when neither the line, the item nor the vendor
   * names an account. Upstream used 6000; this chart puts wages there, so the
   * catch-all is 6999 Uncategorized Expense — visible in a review, harmless in
   * a report.
   */
  defaultExpense: number
}

/** Resolved once, outside the transaction, so a missing control account fails first. */
export async function purchasingAccounts(db: TenantClient): Promise<PurchasingAccounts> {
  const [payable, inventory, salesTax, checking, creditCard, defaultExpense] = await Promise.all([
    controlAccountId(db, CONTROL_ACCOUNTS.ACCOUNTS_PAYABLE),
    controlAccountId(db, CONTROL_ACCOUNTS.INVENTORY),
    controlAccountId(db, CONTROL_ACCOUNTS.SALES_TAX_PAYABLE),
    controlAccountId(db, CONTROL_ACCOUNTS.CHECKING),
    controlAccountId(db, CONTROL_ACCOUNTS.CREDIT_CARD),
    controlAccountId(db, CONTROL_ACCOUNTS.UNCATEGORIZED_EXPENSE),
  ])
  return { payable, inventory, salesTax, checking, creditCard, defaultExpense }
}

// ---------------------------------------------------------------------------
// Line maths
// ---------------------------------------------------------------------------

export type PurchaseLineInput = {
  itemId?: number | null
  accountId?: number | null
  description?: string | null
  quantity: Decimal.Value
  rate: Decimal.Value
  jobId?: number | null
  classId?: number | null
  costCodeId?: number | null
  functionCode?: string | null
  isBillable?: boolean
  lineOrder?: number
}

export type PricedPurchaseLine = PurchaseLineInput & { amount: Decimal; lineOrder: number }

export type PurchaseTotals = {
  lines: PricedPurchaseLine[]
  subtotal: Decimal
  taxAmount: Decimal
  total: Decimal
}

/**
 * Price a purchase document. Purchase lines have no per-line taxability — the
 * whole subtotal is taxed — so the shape is simpler than the sales side, but
 * the rule is identical: extend each line to cents, then sum.
 */
export function pricePurchase(lines: PurchaseLineInput[], taxRate: Decimal.Value): PurchaseTotals {
  const priced: PricedPurchaseLine[] = lines.map((line, index) => ({
    ...line,
    lineOrder: line.lineOrder ?? index,
    amount: extend(line.quantity, line.rate),
  }))
  const subtotal = cents(sum(priced.map((line) => line.amount)))
  const taxAmount = cents(subtotal.times(money(taxRate)))
  return { lines: priced, subtotal, taxAmount, total: cents(subtotal.plus(taxAmount)) }
}

function assertTaxRate(taxRate: Decimal.Value) {
  const rate = money(taxRate)
  if (rate.isNegative()) throw new PurchasingError('The tax rate cannot be negative.')
  if (rate.greaterThan(1)) {
    throw new PurchasingError(
      'The tax rate is a fraction of the subtotal (0.089 = 8.9%). Divide the percentage by 100.',
    )
  }
}

function assertLines(lines: PurchaseLineInput[], noun: string) {
  if (lines.length === 0) throw new PurchasingError(`Add at least one line to this ${noun}.`)
  for (const [index, line] of lines.entries()) {
    if (money(line.quantity).isNegative()) {
      throw new PurchasingError(
        `Line ${index + 1}: quantity cannot be negative. Use a vendor credit for a return.`,
      )
    }
    if (money(line.rate).isNegative()) {
      throw new PurchasingError(
        `Line ${index + 1}: rate cannot be negative. Use a vendor credit for a return.`,
      )
    }
  }
}

type ItemFacts = {
  id: number
  name: string
  trackInventory: boolean
  expenseAccountId: number | null
  assetAccountId: number | null
}

async function loadItems(
  db: TenantClient,
  lines: { itemId?: number | null }[],
): Promise<Map<number, ItemFacts>> {
  const ids = [...new Set(lines.map((l) => l.itemId).filter((id): id is number => id != null))]
  if (ids.length === 0) return new Map()
  const items = await db.item.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      trackInventory: true,
      expenseAccountId: true,
      assetAccountId: true,
    },
  })
  if (items.length !== ids.length) {
    throw new PurchasingError('One of the items on this document no longer exists.')
  }
  return new Map(items.map((item) => [item.id, item]))
}

type VendorFacts = { id: number; name: string; terms: string | null; defaultExpenseAccountId: number | null }

async function loadVendor(db: TenantClient, vendorId: number): Promise<VendorFacts> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, terms: true, defaultExpenseAccountId: true },
  })
  if (!vendor) throw new PurchasingError('Vendor not found.', 404)
  return vendor
}

/**
 * Which account a purchase line hits.
 *
 * An inventory-tracked item always lands on its asset account (or 1300): stock
 * bought is an asset, not an expense, until it is sold. Everything else walks
 * the chain line → item → vendor → catch-all, first non-null wins.
 */
function postingAccountFor(
  line: PurchaseLineInput,
  item: ItemFacts | undefined,
  vendor: VendorFacts,
  accounts: PurchasingAccounts,
): { accountId: number; isInventory: boolean } {
  if (item?.trackInventory) {
    return { accountId: item.assetAccountId ?? accounts.inventory, isInventory: true }
  }
  return {
    accountId:
      line.accountId ??
      item?.expenseAccountId ??
      vendor.defaultExpenseAccountId ??
      accounts.defaultExpense,
    isInventory: false,
  }
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export type VendorInput = {
  name: string
  companyName?: string | null
  email?: string | null
  phone?: string | null
  fax?: string | null
  website?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  terms?: string | null
  taxId?: string | null
  accountNumber?: string | null
  defaultExpenseAccountId?: number | null
  /** 1099 tracking. Upstream had no write path for the eligibility trio; this does. */
  is1099Vendor?: boolean
  vendor1099Type?: string | null
  is1099Eligible?: boolean
  w9OnFile?: boolean
  notes?: string | null
  isActive?: boolean
}

export async function createVendor(db: TenantClient, input: VendorInput) {
  const name = input.name.trim()
  if (name === '') throw new PurchasingError('Enter a vendor name.')
  const clash = await db.vendor.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
    select: { id: true },
  })
  if (clash) throw new PurchasingError('A vendor with that name already exists.', 409)
  return db.vendor.create({ data: vendorData(input) })
}

export async function updateVendor(db: TenantClient, id: number, input: VendorInput) {
  const existing = await db.vendor.findUnique({ where: { id } })
  if (!existing) throw new PurchasingError('Vendor not found.', 404)
  return db.vendor.update({ where: { id }, data: vendorData(input) })
}

/** Vendors are never deleted — bills point at them. They deactivate. */
export async function setVendorActive(db: TenantClient, id: number, isActive: boolean) {
  const existing = await db.vendor.findUnique({ where: { id } })
  if (!existing) throw new PurchasingError('Vendor not found.', 404)
  return db.vendor.update({ where: { id }, data: { isActive } })
}

function vendorData(input: VendorInput) {
  return {
    name: input.name.trim(),
    companyName: nullable(input.companyName),
    email: nullable(input.email)?.toLowerCase() ?? null,
    phone: nullable(input.phone),
    fax: nullable(input.fax),
    website: nullable(input.website),
    address1: nullable(input.address1),
    address2: nullable(input.address2),
    city: nullable(input.city),
    state: nullable(input.state),
    zip: nullable(input.zip),
    country: nullable(input.country) ?? 'US',
    terms: nullable(input.terms) ?? 'Net 30',
    taxId: nullable(input.taxId),
    accountNumber: nullable(input.accountNumber),
    defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
    is1099Vendor: input.is1099Vendor ?? false,
    vendor1099Type: nullable(input.vendor1099Type),
    is1099Eligible: input.is1099Eligible ?? false,
    w9OnFile: input.w9OnFile ?? false,
    notes: nullable(input.notes),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  }
}

/** Open payable per vendor, derived from bills rather than the cache column. */
export async function vendorBalances(db: TenantClient, vendorIds: number[]) {
  if (vendorIds.length === 0) return new Map<number, Decimal>()
  const rows = await db.bill.groupBy({
    by: ['vendorId'],
    where: { vendorId: { in: vendorIds }, status: { not: BillStatus.VOID } },
    _sum: { balanceDue: true },
  })
  return new Map(rows.map((row) => [row.vendorId, money(row._sum.balanceDue?.toString() ?? 0)]))
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/**
 * Propose the next number in a series: honour the series' own last value and
 * never collide with a number already used.
 */
async function nextNumber(args: {
  prefix: string
  seed: number
  pad: number
  lastUsed: () => Promise<string | null>
  taken: (candidate: string) => Promise<boolean>
}): Promise<string> {
  let pad = args.pad
  let n = args.seed

  const last = await args.lastUsed()
  if (last && last.startsWith(args.prefix)) {
    const digits = last.slice(args.prefix.length)
    if (digits.length > 0 && /^\d+$/.test(digits)) {
      n = Math.max(n, Number.parseInt(digits, 10) + 1)
      pad = Math.max(pad, digits.length)
    }
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${args.prefix}${String(n).padStart(pad, '0')}`
    if (!(await args.taken(candidate))) return candidate
    n += 1
  }
  throw new PurchasingError('Could not assign a unique document number — please retry.', 503)
}

async function settingValue(db: TenantClient, key: string) {
  const row = await db.setting.findUnique({ where: { key } })
  return row?.value ?? ''
}

async function nextPoNumber(tx: TenantClient) {
  const prefix = (await settingValue(tx, 'po_prefix')) || 'PO-'
  return nextNumber({
    prefix,
    seed: 1,
    pad: 4,
    lastUsed: async () =>
      (
        await tx.purchaseOrder.findFirst({
          where: { poNumber: { startsWith: prefix } },
          orderBy: { poNumber: 'desc' },
          select: { poNumber: true },
        })
      )?.poNumber ?? null,
    taken: async (candidate) => (await tx.purchaseOrder.count({ where: { poNumber: candidate } })) > 0,
  })
}

async function nextVendorCreditNumber(tx: TenantClient) {
  const prefix = 'VC-'
  return nextNumber({
    prefix,
    seed: 1,
    pad: 4,
    lastUsed: async () =>
      (
        await tx.vendorCredit.findFirst({
          where: { creditNumber: { startsWith: prefix } },
          orderBy: { creditNumber: 'desc' },
          select: { creditNumber: true },
        })
      )?.creditNumber ?? null,
    taken: async (candidate) => (await tx.vendorCredit.count({ where: { creditNumber: candidate } })) > 0,
  })
}

/**
 * A bill number is the vendor's own invoice number, so it is only unique per
 * vendor. When the vendor did not give one, `20260915-ACME` stands in.
 */
async function defaultBillNumber(tx: TenantClient, vendor: VendorFacts, date: Date) {
  const initials =
    (vendor.name.match(/[A-Za-z0-9]+/g) ?? [])
      .map((token) => token[0]!.toUpperCase())
      .join('')
      .slice(0, 4) || 'BILL'
  const base = `${date.toISOString().slice(0, 10).replace(/-/g, '')}-${initials}`

  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const taken = await tx.bill.count({ where: { vendorId: vendor.id, billNumber: candidate } })
    if (taken === 0) return candidate
  }
  throw new PurchasingError('Could not assign a bill number — enter one by hand.', 503)
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export type BillInput = {
  vendorId: number
  billNumber?: string | null
  date: Date
  dueDate?: Date | null
  terms?: string | null
  refNumber?: string | null
  poId?: number | null
  taxRate?: Decimal.Value
  notes?: string | null
  classId?: number | null
  jobId?: number | null
  lines: PurchaseLineInput[]
}

function billStatusFor(total: Decimal, amountPaid: Decimal): BillStatus {
  if (!amountPaid.greaterThan(0)) return BillStatus.UNPAID
  return cents(total.minus(amountPaid)).greaterThan(0) ? BillStatus.PARTIAL : BillStatus.PAID
}

/** The cost side of a bill: expense (or inventory) debited, A/P credited. */
function billJournalLines(args: {
  accounts: PurchasingAccounts
  items: Map<number, ItemFacts>
  vendor: VendorFacts
  lines: PricedPurchaseLine[]
  taxAmount: Decimal
  total: Decimal
  reference: string
}): JournalLine[] {
  const lines: JournalLine[] = []

  for (const line of args.lines) {
    if (line.amount.isZero()) continue
    const item = line.itemId != null ? args.items.get(line.itemId) : undefined
    const { accountId } = postingAccountFor(line, item, args.vendor, args.accounts)
    lines.push({
      accountId,
      debit: line.amount,
      description: line.description ?? item?.name ?? args.reference,
      jobId: line.jobId ?? null,
      classId: line.classId ?? null,
      costCodeId: line.costCodeId ?? null,
      function: line.functionCode ?? null,
      isBillable: line.isBillable ?? false,
    })
  }

  if (args.taxAmount.greaterThan(0)) {
    lines.push({
      accountId: args.accounts.salesTax,
      debit: args.taxAmount,
      description: 'Sales tax on bill',
    })
  }

  lines.push({
    accountId: args.accounts.payable,
    credit: args.total,
    description: `${args.reference} — ${args.vendor.name}`,
  })

  return lines
}

/** Receive the stock a bill brings in, at the price on the line. */
async function receiveStock(
  tx: TenantClient,
  args: {
    items: Map<number, ItemFacts>
    lines: PricedPurchaseLine[]
    date: Date
    reference: string
    sourceType: string
    sourceId: number
    transactionId: number | null
  },
) {
  for (const line of args.lines) {
    if (line.itemId == null) continue
    const item = args.items.get(line.itemId)
    if (!item?.trackInventory) continue
    const quantity = quantizeQty(line.quantity)
    if (!quantity.greaterThan(0)) continue
    // No separate entry: the bill's own debit already put the value into 1300.
    await recordMovement(tx, {
      itemId: item.id,
      type: InventoryMovementType.PURCHASE,
      quantity,
      unitCost: money(line.rate),
      date: args.date,
      reference: args.reference,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      transactionId: args.transactionId,
    })
  }
}

/** Take back the stock a bill brought in, at the price it came in at. */
async function reverseStock(
  tx: TenantClient,
  args: {
    items: Map<number, ItemFacts>
    lines: { itemId: number | null; quantity: Decimal.Value; rate: Decimal.Value }[]
    date: Date
    reference: string
    sourceType: string
    sourceId: number
  },
) {
  for (const line of args.lines) {
    if (line.itemId == null) continue
    const item = args.items.get(line.itemId)
    if (!item?.trackInventory) continue
    const quantity = quantizeQty(line.quantity)
    if (!quantity.greaterThan(0)) continue
    await recordMovement(tx, {
      itemId: item.id,
      type: InventoryMovementType.VOID,
      quantity: quantity.negated(),
      unitCost: money(line.rate),
      date: args.date,
      reference: args.reference,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
    })
  }
}

async function prepareBill(db: TenantClient, input: BillInput) {
  assertLines(input.lines, 'bill')
  assertTaxRate(input.taxRate ?? 0)
  const vendor = await loadVendor(db, input.vendorId)
  const items = await loadItems(db, input.lines)
  const totals = pricePurchase(input.lines, input.taxRate ?? 0)
  const terms = input.terms ?? vendor.terms ?? 'Net 30'
  const dueDate = input.dueDate ?? dueDateFromTerms(input.date, terms)
  return { vendor, items, totals, terms, dueDate }
}

function billLineRows(totals: PurchaseTotals, resolve: (line: PricedPurchaseLine) => number) {
  return totals.lines.map((line) => ({
    itemId: line.itemId ?? null,
    accountId: resolve(line),
    description: nullable(line.description),
    quantity: quantizeQty(line.quantity).toFixed(4),
    rate: money(line.rate).toFixed(2),
    amount: line.amount.toFixed(2),
    jobId: line.jobId ?? null,
    classId: line.classId ?? null,
    costCodeId: line.costCodeId ?? null,
    functionCode: nullable(line.functionCode),
    isBillable: line.isBillable ?? false,
    lineOrder: line.lineOrder,
  }))
}

/** Enter and post a bill. Returns the new bill id and its number. */
export async function createBill(db: TenantClient, input: BillInput) {
  await assertPostable(db, input.date)
  const { vendor, items, totals, terms, dueDate } = await prepareBill(db, input)
  const accounts = await purchasingAccounts(db)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    const supplied = nullable(input.billNumber)
    const billNumber = supplied ?? (await defaultBillNumber(tx, vendor, input.date))
    if (supplied) {
      const clash = await tx.bill.findFirst({
        where: { vendorId: vendor.id, billNumber: supplied },
        select: { id: true },
      })
      if (clash) {
        throw new PurchasingError(
          `${vendor.name} already has a bill numbered ${supplied}. Use a different number.`,
          409,
        )
      }
    }

    const bill = await tx.bill.create({
      data: {
        billNumber,
        vendorId: vendor.id,
        status: BillStatus.UNPAID,
        poId: input.poId ?? null,
        date: input.date,
        dueDate,
        terms,
        refNumber: nullable(input.refNumber),
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        amountPaid: '0.00',
        balanceDue: totals.total.toFixed(2),
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        billLines: {
          create: billLineRows(
            totals,
            (line) =>
              postingAccountFor(
                line,
                line.itemId != null ? items.get(line.itemId) : undefined,
                vendor,
                accounts,
              ).accountId,
          ),
        },
      },
    })

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `Bill ${billNumber} — ${vendor.name}`,
      reference: billNumber,
      sourceType: 'bill',
      sourceId: bill.id,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: billJournalLines({
        accounts,
        items,
        vendor,
        lines: totals.lines,
        taxAmount: totals.taxAmount,
        total: totals.total,
        reference: `Bill ${billNumber}`,
      }),
    })

    await tx.bill.update({ where: { id: bill.id }, data: { transactionId: entry.id } })

    await receiveStock(tx, {
      items,
      lines: totals.lines,
      date: input.date,
      reference: `Bill ${billNumber}`,
      sourceType: 'bill',
      sourceId: bill.id,
      transactionId: entry.id,
    })

    return { id: bill.id, billNumber }
  })
}

/**
 * Edit a bill. The old entry is reversed and a new one posted, and the stock
 * the old version received goes back out before the new version receives its
 * own — so neither ledger drifts.
 */
export async function updateBill(db: TenantClient, id: number, input: BillInput) {
  const existing = await db.bill.findUnique({ where: { id }, include: { billLines: true } })
  if (!existing) throw new PurchasingError('Bill not found.', 404)
  if (existing.status === BillStatus.VOID) throw new PurchasingError('A voided bill cannot be edited.')
  if (money(existing.amountPaid.toString()).greaterThan(0)) {
    throw new PurchasingError(
      'This bill has payments or credits applied. Void those first, then edit the bill.',
    )
  }

  await assertPostable(db, existing.date)
  await assertPostable(db, input.date)

  const { vendor, items, totals, terms, dueDate } = await prepareBill(db, input)
  const accounts = await purchasingAccounts(db)

  const previousLines = existing.billLines.map((line) => ({
    itemId: line.itemId,
    quantity: quantizeQty(line.quantity.toString()),
    rate: money(line.rate.toString()),
  }))
  const previousItems = await loadItems(db, previousLines)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    await reverseBillPostings(tx, {
      billId: existing.id,
      billNumber: existing.billNumber,
      date: existing.date,
      reason: 'edit',
    })
    await reverseStock(tx, {
      items: previousItems,
      lines: previousLines,
      date: existing.date,
      reference: `Revision of bill ${existing.billNumber}`,
      sourceType: 'bill_edit',
      sourceId: existing.id,
    })

    await tx.billLine.deleteMany({ where: { billId: existing.id } })

    await tx.bill.update({
      where: { id: existing.id },
      data: {
        vendorId: vendor.id,
        date: input.date,
        dueDate,
        terms,
        refNumber: nullable(input.refNumber),
        poId: input.poId ?? existing.poId,
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        balanceDue: totals.total.toFixed(2),
        status: BillStatus.UNPAID,
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        billLines: {
          create: billLineRows(
            totals,
            (line) =>
              postingAccountFor(
                line,
                line.itemId != null ? items.get(line.itemId) : undefined,
                vendor,
                accounts,
              ).accountId,
          ),
        },
      },
    })

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `Bill ${existing.billNumber} (revised) — ${vendor.name}`,
      reference: existing.billNumber,
      sourceType: 'bill',
      sourceId: existing.id,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: billJournalLines({
        accounts,
        items,
        vendor,
        lines: totals.lines,
        taxAmount: totals.taxAmount,
        total: totals.total,
        reference: `Bill ${existing.billNumber}`,
      }),
    })

    await tx.bill.update({ where: { id: existing.id }, data: { transactionId: entry.id } })

    await receiveStock(tx, {
      items,
      lines: totals.lines,
      date: input.date,
      reference: `Bill ${existing.billNumber}`,
      sourceType: 'bill',
      sourceId: existing.id,
      transactionId: entry.id,
    })

    return { id: existing.id, billNumber: existing.billNumber }
  })
}

async function reverseBillPostings(
  tx: TenantClient,
  args: { billId: number; billNumber: string; date: Date; reason: 'edit' | 'void' },
) {
  const postings = await tx.transaction.findMany({
    where: { sourceId: args.billId, sourceType: 'bill', isVoided: false },
    select: { id: true },
  })
  for (const posting of postings) {
    await reverseTransaction(tx, posting.id, {
      date: args.date,
      description:
        args.reason === 'void'
          ? `VOID bill ${args.billNumber}`
          : `Revision of bill ${args.billNumber}`,
    })
  }
}

export async function voidBill(db: TenantClient, id: number) {
  const bill = await db.bill.findUnique({ where: { id }, include: { billLines: true } })
  if (!bill) throw new PurchasingError('Bill not found.', 404)
  if (bill.status === BillStatus.VOID) throw new PurchasingError('This bill is already voided.')
  if (money(bill.amountPaid.toString()).greaterThan(0)) {
    throw new PurchasingError(
      'This bill has payments or credits applied. Void the payment first, then void the bill.',
    )
  }
  await assertPostable(db, bill.date)

  const lines = bill.billLines.map((line) => ({
    itemId: line.itemId,
    quantity: quantizeQty(line.quantity.toString()),
    rate: money(line.rate.toString()),
  }))
  const items = await loadItems(db, lines)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    await reverseBillPostings(tx, {
      billId: bill.id,
      billNumber: bill.billNumber,
      date: bill.date,
      reason: 'void',
    })
    await reverseStock(tx, {
      items,
      lines,
      date: bill.date,
      reference: `VOID bill ${bill.billNumber}`,
      sourceType: 'bill_void',
      sourceId: bill.id,
    })
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: BillStatus.VOID, balanceDue: '0.00' },
    })
    return { id: bill.id }
  })
}

/** Bills with an open balance for a vendor (or everyone), oldest first. */
export function openBills(db: TenantClient, vendorId?: number) {
  return db.bill.findMany({
    where: {
      ...(vendorId ? { vendorId } : {}),
      status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] },
      balanceDue: { gt: 0 },
    },
    orderBy: [{ dueDate: 'asc' }, { date: 'asc' }, { id: 'asc' }],
    include: { vendor: { select: { id: true, name: true } } },
  })
}

/** Vendor credits with an unapplied balance. */
export function openVendorCredits(db: TenantClient, vendorId?: number) {
  return db.vendorCredit.findMany({
    where: {
      ...(vendorId ? { vendorId } : {}),
      status: VendorCreditStatus.ISSUED,
      balanceRemaining: { gt: 0 },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: { vendor: { select: { id: true, name: true } } },
  })
}

// ---------------------------------------------------------------------------
// Bill payments
// ---------------------------------------------------------------------------

export type BillAllocationInput = { billId: number; amount: Decimal.Value }

export type BillPaymentInput = {
  vendorId: number
  date: Date
  amount: Decimal.Value
  method?: string | null
  checkNumber?: string | null
  payFromAccountId?: number | null
  notes?: string | null
  allocations?: BillAllocationInput[]
  /** Leave the allocations empty and this settles the oldest bills first. */
  autoApply?: boolean
}

/**
 * Pay a vendor. A payment relieves accounts payable for its whole amount — the
 * part that is not allocated to a bill is a prepayment sitting against the
 * vendor, which is why A/P is debited with the payment, not the applied total.
 */
export async function payVendor(db: TenantClient, input: BillPaymentInput) {
  await assertPostable(db, input.date)

  const amount = cents(input.amount)
  if (!amount.greaterThan(0)) {
    throw new PurchasingError('A payment must be more than zero.')
  }

  const vendor = await loadVendor(db, input.vendorId)
  const accounts = await purchasingAccounts(db)
  const payFrom = input.payFromAccountId ?? accounts.checking
  if (payFrom === accounts.payable) {
    throw new PurchasingError('A payment cannot be drawn from accounts payable itself.')
  }

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    const requested = input.allocations?.filter((a) => money(a.amount).greaterThan(0)) ?? []
    const allocations =
      requested.length > 0
        ? requested.map((a) => ({ billId: a.billId, amount: cents(a.amount) }))
        : input.autoApply === false
          ? []
          : await oldestBillsFirst(tx, vendor.id, amount)

    const applied = cents(sum(allocations.map((a) => a.amount)))
    if (applied.greaterThan(amount)) {
      throw new PurchasingError('The allocated amounts add up to more than the payment.')
    }

    const payment = await tx.billPayment.create({
      data: {
        vendorId: vendor.id,
        date: input.date,
        amount: amount.toFixed(2),
        method: nullable(input.method),
        checkNumber: nullable(input.checkNumber),
        payFromAccountId: payFrom,
        notes: nullable(input.notes),
      },
    })

    for (const allocation of allocations) {
      const bill = await tx.bill.findUnique({ where: { id: allocation.billId } })
      if (!bill) throw new PurchasingError(`Bill ${allocation.billId} not found.`, 404)
      if (bill.vendorId !== vendor.id) {
        throw new PurchasingError(`Bill ${bill.billNumber} belongs to another vendor.`)
      }
      if (bill.status === BillStatus.VOID) {
        throw new PurchasingError(`Bill ${bill.billNumber} is voided.`)
      }

      const balance = money(bill.balanceDue.toString())
      if (allocation.amount.greaterThan(balance)) {
        throw new PurchasingError(
          `${allocation.amount.toFixed(2)} is more than the ${balance.toFixed(2)} still open on bill ${bill.billNumber}.`,
        )
      }

      const paid = cents(money(bill.amountPaid.toString()).plus(allocation.amount))
      const remaining = cents(balance.minus(allocation.amount))

      await tx.billPaymentAllocation.create({
        data: {
          billPaymentId: payment.id,
          billId: bill.id,
          amount: allocation.amount.toFixed(2),
        },
      })
      await tx.bill.update({
        where: { id: bill.id },
        data: {
          amountPaid: paid.toFixed(2),
          balanceDue: remaining.toFixed(2),
          status: billStatusFor(money(bill.total.toString()), paid),
        },
      })
    }

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `Bill payment to ${vendor.name}`,
      reference: nullable(input.checkNumber) ?? nullable(input.method),
      sourceType: 'bill_payment',
      sourceId: payment.id,
      lines: [
        { accountId: accounts.payable, debit: amount, description: `Bill payment to ${vendor.name}` },
        { accountId: payFrom, credit: amount, description: `Bill payment to ${vendor.name}` },
      ],
    })

    await tx.billPayment.update({ where: { id: payment.id }, data: { transactionId: entry.id } })
    return { id: payment.id, applied, unapplied: cents(amount.minus(applied)) }
  })
}

async function oldestBillsFirst(tx: TenantClient, vendorId: number, amount: Decimal) {
  const open = await tx.bill.findMany({
    where: {
      vendorId,
      status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] },
      balanceDue: { gt: 0 },
    },
    orderBy: [{ dueDate: 'asc' }, { date: 'asc' }, { id: 'asc' }],
  })

  let left = amount
  const allocations: { billId: number; amount: Decimal }[] = []
  for (const bill of open) {
    if (!left.greaterThan(0)) break
    const balance = money(bill.balanceDue.toString())
    const take = cents(Decimal.min(balance, left))
    if (!take.greaterThan(0)) continue
    allocations.push({ billId: bill.id, amount: take })
    left = cents(left.minus(take))
  }
  return allocations
}

/** Void a payment: reverse the cash entry and re-open every bill it settled. */
export async function voidBillPayment(db: TenantClient, id: number) {
  const payment = await db.billPayment.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      billPaymentAllocations: { include: { bill: true } },
    },
  })
  if (!payment) throw new PurchasingError('Bill payment not found.', 404)
  if (payment.isVoided) throw new PurchasingError('This payment is already voided.')
  await assertPostable(db, payment.date)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    if (payment.transactionId) {
      await reverseTransaction(tx, payment.transactionId, {
        date: payment.date,
        description: `VOID bill payment to ${payment.vendor.name}`,
      })
    }

    for (const allocation of payment.billPaymentAllocations) {
      const bill = allocation.bill
      if (bill.status === BillStatus.VOID) continue
      const amount = money(allocation.amount.toString())
      const paid = cents(money(bill.amountPaid.toString()).minus(amount))
      const settled = paid.isNegative() ? ZERO : paid
      const balance = cents(money(bill.total.toString()).minus(settled))
      await tx.bill.update({
        where: { id: bill.id },
        data: {
          amountPaid: settled.toFixed(2),
          balanceDue: balance.toFixed(2),
          status: billStatusFor(money(bill.total.toString()), settled),
        },
      })
    }

    await tx.billPayment.update({ where: { id }, data: { isVoided: true } })
    return { id }
  })
}

/**
 * The "pay bills" screen in one call: apply whatever credits were ticked (no
 * entry — accounts payable already moved when the credit was issued), then
 * write **one** payment for the cash that is left, allocated across the bills
 * that were ticked.
 */
export async function payBills(
  db: TenantClient,
  input: {
    vendorId: number
    date: Date
    payFromAccountId?: number | null
    method?: string | null
    checkNumber?: string | null
    notes?: string | null
    allocations: BillAllocationInput[]
    credits?: { vendorCreditId: number; billId: number; amount: Decimal.Value }[]
  },
) {
  const credits = (input.credits ?? []).filter((c) => money(c.amount).greaterThan(0))
  for (const credit of credits) {
    await applyVendorCredit(db, credit.vendorCreditId, credit.billId, credit.amount)
  }

  const cash = input.allocations.filter((a) => money(a.amount).greaterThan(0))
  const total = cents(sum(cash.map((a) => a.amount)))
  if (!total.greaterThan(0)) {
    if (credits.length > 0) return { id: null as number | null, applied: ZERO, unapplied: ZERO }
    throw new PurchasingError('Tick at least one bill to pay, or a credit to apply.')
  }

  return payVendor(db, {
    vendorId: input.vendorId,
    date: input.date,
    amount: total,
    method: input.method,
    checkNumber: input.checkNumber,
    payFromAccountId: input.payFromAccountId,
    notes: input.notes,
    allocations: cash,
  })
}

// ---------------------------------------------------------------------------
// Purchase orders — non-posting
// ---------------------------------------------------------------------------

export type PurchaseOrderInput = {
  vendorId: number
  date: Date
  expectedDate?: Date | null
  shipTo?: string | null
  taxRate?: Decimal.Value
  notes?: string | null
  jobId?: number | null
  lines: PurchaseLineInput[]
}

/** A purchase order is an intention, not a financial event: it posts nothing. */
export async function createPurchaseOrder(db: TenantClient, input: PurchaseOrderInput) {
  assertLines(input.lines, 'purchase order')
  assertTaxRate(input.taxRate ?? 0)
  const vendor = await loadVendor(db, input.vendorId)
  await loadItems(db, input.lines)
  const totals = pricePurchase(input.lines, input.taxRate ?? 0)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const poNumber = await nextPoNumber(tx)
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: vendor.id,
        status: PoStatus.DRAFT,
        date: input.date,
        expectedDate: input.expectedDate ?? null,
        shipTo: nullable(input.shipTo),
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        notes: nullable(input.notes),
        jobId: input.jobId ?? null,
        purchaseOrderLines: { create: poLineRows(totals) },
      },
    })
    return { id: po.id, poNumber }
  })
}

function poLineRows(totals: PurchaseTotals) {
  return totals.lines.map((line) => ({
    itemId: line.itemId ?? null,
    description: nullable(line.description),
    quantity: quantizeQty(line.quantity).toFixed(4),
    rate: money(line.rate).toFixed(2),
    amount: line.amount.toFixed(2),
    jobId: line.jobId ?? null,
    costCodeId: line.costCodeId ?? null,
    lineOrder: line.lineOrder,
  }))
}

export async function updatePurchaseOrder(db: TenantClient, id: number, input: PurchaseOrderInput) {
  const existing = await db.purchaseOrder.findUnique({ where: { id } })
  if (!existing) throw new PurchasingError('Purchase order not found.', 404)
  if (existing.status === PoStatus.CLOSED) {
    throw new PurchasingError('This purchase order has been billed and can no longer be edited.')
  }
  assertLines(input.lines, 'purchase order')
  assertTaxRate(input.taxRate ?? 0)
  const vendor = await loadVendor(db, input.vendorId)
  await loadItems(db, input.lines)
  const totals = pricePurchase(input.lines, input.taxRate ?? 0)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } })
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        vendorId: vendor.id,
        date: input.date,
        expectedDate: input.expectedDate ?? null,
        shipTo: nullable(input.shipTo),
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        notes: nullable(input.notes),
        jobId: input.jobId ?? null,
        purchaseOrderLines: { create: poLineRows(totals) },
      },
    })
    return { id, poNumber: existing.poNumber }
  })
}

export async function setPurchaseOrderStatus(db: TenantClient, id: number, status: 'DRAFT' | 'SENT' | 'CLOSED') {
  const po = await db.purchaseOrder.findUnique({ where: { id } })
  if (!po) throw new PurchasingError('Purchase order not found.', 404)
  if (po.status === PoStatus.CLOSED && status !== 'CLOSED') {
    throw new PurchasingError('A closed purchase order cannot be reopened.')
  }
  await db.purchaseOrder.update({ where: { id }, data: { status: PoStatus[status] } })
  return { id }
}

/**
 * Record what actually turned up. Receiving moves no money and no stock — the
 * bill does both — it records quantities so a part-delivered order reads
 * honestly and the outstanding balance is visible.
 */
export async function receivePurchaseOrder(
  db: TenantClient,
  id: number,
  received: { lineId: number; quantity: Decimal.Value }[],
) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { purchaseOrderLines: true },
  })
  if (!po) throw new PurchasingError('Purchase order not found.', 404)
  if (po.status === PoStatus.CLOSED) {
    throw new PurchasingError('This purchase order has been billed and is closed.')
  }

  const byId = new Map(po.purchaseOrderLines.map((line) => [line.id, line]))
  for (const entry of received) {
    const line = byId.get(entry.lineId)
    if (!line) throw new PurchasingError('That line is not on this purchase order.', 404)
    const quantity = quantizeQty(entry.quantity)
    if (quantity.isNegative()) throw new PurchasingError('A received quantity cannot be negative.')
    if (quantity.greaterThan(quantizeQty(line.quantity.toString()))) {
      throw new PurchasingError(
        `You cannot receive more than the ${quantizeQty(line.quantity.toString()).toFixed(2)} ordered on this line.`,
      )
    }
  }

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    for (const entry of received) {
      await tx.purchaseOrderLine.update({
        where: { id: entry.lineId },
        data: { receivedQty: quantizeQty(entry.quantity).toFixed(4) },
      })
    }

    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } })
    const ordered = sum(lines.map((line) => quantizeQty(line.quantity.toString())))
    const got = sum(lines.map((line) => quantizeQty(line.receivedQty.toString())))
    const status = got.isZero()
      ? PoStatus.SENT
      : got.greaterThanOrEqualTo(ordered)
        ? PoStatus.RECEIVED
        : PoStatus.PARTIAL

    await tx.purchaseOrder.update({ where: { id }, data: { status } })
    return { id, status }
  })
}

/**
 * Turn a purchase order into a bill. The PO closes, the bill posts — the order
 * itself never did.
 */
export async function convertPurchaseOrderToBill(
  db: TenantClient,
  id: number,
  opts: { date?: Date; billNumber?: string | null } = {},
) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { purchaseOrderLines: { orderBy: { lineOrder: 'asc' } } },
  })
  if (!po) throw new PurchasingError('Purchase order not found.', 404)
  if (po.status === PoStatus.CLOSED) {
    throw new PurchasingError('This purchase order has already been billed.')
  }

  const bill = await createBill(db, {
    vendorId: po.vendorId,
    billNumber: nullable(opts.billNumber) ?? `BILL-${po.poNumber}`,
    date: opts.date ?? po.date,
    poId: po.id,
    taxRate: po.taxRate.toString(),
    notes: `From ${po.poNumber}`,
    jobId: po.jobId,
    lines: po.purchaseOrderLines.map((line, index) => ({
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity.toString(),
      rate: line.rate.toString(),
      jobId: line.jobId ?? po.jobId,
      costCodeId: line.costCodeId,
      lineOrder: line.lineOrder ?? index,
    })),
  })

  await db.purchaseOrder.update({ where: { id }, data: { status: PoStatus.CLOSED } })
  return bill
}

// ---------------------------------------------------------------------------
// Vendor credits
// ---------------------------------------------------------------------------

export type VendorCreditInput = {
  vendorId: number
  date: Date
  originalBillId?: number | null
  refNumber?: string | null
  taxRate?: Decimal.Value
  notes?: string | null
  classId?: number | null
  jobId?: number | null
  lines: PurchaseLineInput[]
}

/**
 * Issue a vendor credit: the mirror of a bill. Accounts payable is debited and
 * the expense (or inventory) credited back. Goods returned go out of stock at
 * the price on the credit line — not the running average — so a bill and the
 * credit reversing it net to zero on both quantity and value.
 */
export async function issueVendorCredit(db: TenantClient, input: VendorCreditInput) {
  await assertPostable(db, input.date)
  assertLines(input.lines, 'vendor credit')
  assertTaxRate(input.taxRate ?? 0)

  const vendor = await loadVendor(db, input.vendorId)
  const items = await loadItems(db, input.lines)
  const totals = pricePurchase(input.lines, input.taxRate ?? 0)
  if (!totals.total.greaterThan(0)) {
    throw new PurchasingError(
      'A vendor credit must be worth more than zero. Enter it as a positive amount — the document is what makes it a credit.',
    )
  }

  if (input.originalBillId != null) {
    const bill = await db.bill.findUnique({
      where: { id: input.originalBillId },
      select: { vendorId: true },
    })
    if (!bill) throw new PurchasingError('That bill could not be found.', 404)
    if (bill.vendorId !== vendor.id) {
      throw new PurchasingError('That bill belongs to a different vendor.')
    }
  }

  const accounts = await purchasingAccounts(db)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const creditNumber = await nextVendorCreditNumber(tx)

    const credit = await tx.vendorCredit.create({
      data: {
        creditNumber,
        vendorId: vendor.id,
        status: VendorCreditStatus.ISSUED,
        originalBillId: input.originalBillId ?? null,
        refNumber: nullable(input.refNumber),
        date: input.date,
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        amountApplied: '0.00',
        balanceRemaining: totals.total.toFixed(2),
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        vendorCreditLines: {
          create: totals.lines.map((line) => ({
            itemId: line.itemId ?? null,
            accountId: postingAccountFor(
              line,
              line.itemId != null ? items.get(line.itemId) : undefined,
              vendor,
              accounts,
            ).accountId,
            description: nullable(line.description),
            quantity: quantizeQty(line.quantity).toFixed(4),
            rate: money(line.rate).toFixed(2),
            amount: line.amount.toFixed(2),
            jobId: line.jobId ?? null,
            classId: line.classId ?? null,
            costCodeId: line.costCodeId ?? null,
            lineOrder: line.lineOrder,
          })),
        },
      },
    })

    const journal: JournalLine[] = [
      {
        accountId: accounts.payable,
        debit: totals.total,
        description: `Vendor credit ${creditNumber} — ${vendor.name}`,
      },
    ]
    for (const line of totals.lines) {
      if (line.amount.isZero()) continue
      const item = line.itemId != null ? items.get(line.itemId) : undefined
      journal.push({
        accountId: postingAccountFor(line, item, vendor, accounts).accountId,
        credit: line.amount,
        description: line.description ?? item?.name ?? `Vendor credit ${creditNumber}`,
        jobId: line.jobId ?? null,
        classId: line.classId ?? null,
        costCodeId: line.costCodeId ?? null,
      })
    }
    if (totals.taxAmount.greaterThan(0)) {
      journal.push({
        accountId: accounts.salesTax,
        credit: totals.taxAmount,
        description: 'Sales tax on vendor credit',
      })
    }

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `Vendor credit ${creditNumber} — ${vendor.name}`,
      reference: nullable(input.refNumber) ?? creditNumber,
      sourceType: 'vendor_credit',
      sourceId: credit.id,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: journal,
    })
    await tx.vendorCredit.update({ where: { id: credit.id }, data: { transactionId: entry.id } })

    for (const line of totals.lines) {
      if (line.itemId == null) continue
      const item = items.get(line.itemId)
      if (!item?.trackInventory) continue
      const quantity = quantizeQty(line.quantity)
      if (!quantity.greaterThan(0)) continue
      await recordMovement(tx, {
        itemId: item.id,
        type: InventoryMovementType.RETURN_OUT,
        quantity: quantity.negated(),
        unitCost: money(line.rate),
        date: input.date,
        reference: `Return to vendor: ${creditNumber}`,
        sourceType: 'vendor_credit',
        sourceId: credit.id,
        transactionId: entry.id,
      })
    }

    return { id: credit.id, creditNumber, total: totals.total }
  })
}

/**
 * Apply an open credit to a bill. Nothing posts: accounts payable moved when
 * the credit was issued, and this only decides which bill it settles.
 */
export async function applyVendorCredit(
  db: TenantClient,
  creditId: number,
  billId: number,
  requested: Decimal.Value,
) {
  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const credit = await tx.vendorCredit.findUnique({ where: { id: creditId } })
    if (!credit) throw new PurchasingError('Vendor credit not found.', 404)
    if (credit.status === VendorCreditStatus.VOID) {
      throw new PurchasingError('This vendor credit is voided.')
    }

    const bill = await tx.bill.findUnique({ where: { id: billId } })
    if (!bill) throw new PurchasingError('Bill not found.', 404)
    if (bill.status === BillStatus.VOID) throw new PurchasingError('That bill is voided.')
    if (bill.vendorId !== credit.vendorId) {
      throw new PurchasingError(
        'A credit can only be applied to a bill from the vendor who issued it.',
      )
    }

    const amount = cents(requested)
    if (!amount.greaterThan(0)) throw new PurchasingError('Enter an amount to apply.')

    const creditLeft = money(credit.balanceRemaining.toString())
    if (amount.greaterThan(creditLeft)) {
      throw new PurchasingError(`Only ${creditLeft.toFixed(2)} of this credit is still unapplied.`)
    }
    const balance = money(bill.balanceDue.toString())
    if (amount.greaterThan(balance)) {
      throw new PurchasingError(`Bill ${bill.billNumber} only has ${balance.toFixed(2)} open.`)
    }

    await tx.vendorCreditApplication.create({
      data: { vendorCreditId: credit.id, billId: bill.id, amount: amount.toFixed(2) },
    })

    const applied = cents(money(credit.amountApplied.toString()).plus(amount))
    const remaining = cents(creditLeft.minus(amount))
    await tx.vendorCredit.update({
      where: { id: credit.id },
      data: {
        amountApplied: applied.toFixed(2),
        balanceRemaining: remaining.toFixed(2),
        status: remaining.isZero() ? VendorCreditStatus.APPLIED : VendorCreditStatus.ISSUED,
      },
    })

    const paid = cents(money(bill.amountPaid.toString()).plus(amount))
    await tx.bill.update({
      where: { id: bill.id },
      data: {
        amountPaid: paid.toFixed(2),
        balanceDue: cents(balance.minus(amount)).toFixed(2),
        status: billStatusFor(money(bill.total.toString()), paid),
      },
    })

    return { id: credit.id, applied: amount, billNumber: bill.billNumber }
  })
}

export async function voidVendorCredit(db: TenantClient, id: number) {
  const credit = await db.vendorCredit.findUnique({
    where: { id },
    include: {
      vendorCreditApplications: { include: { bill: true } },
      vendorCreditLines: true,
    },
  })
  if (!credit) throw new PurchasingError('Vendor credit not found.', 404)
  if (credit.status === VendorCreditStatus.VOID) {
    throw new PurchasingError('This vendor credit is already voided.')
  }
  await assertPostable(db, credit.date)

  const lines = credit.vendorCreditLines.map((line) => ({
    itemId: line.itemId,
    quantity: quantizeQty(line.quantity.toString()),
    rate: money(line.rate.toString()),
  }))
  const items = await loadItems(db, lines)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    for (const application of credit.vendorCreditApplications) {
      const bill = application.bill
      const amount = money(application.amount.toString())
      if (bill.status !== BillStatus.VOID) {
        const paid = cents(money(bill.amountPaid.toString()).minus(amount))
        const settled = paid.isNegative() ? ZERO : paid
        await tx.bill.update({
          where: { id: bill.id },
          data: {
            amountPaid: settled.toFixed(2),
            balanceDue: cents(money(bill.total.toString()).minus(settled)).toFixed(2),
            status: billStatusFor(money(bill.total.toString()), settled),
          },
        })
      }
      await tx.vendorCreditApplication.delete({ where: { id: application.id } })
    }

    const postings = await tx.transaction.findMany({
      where: { sourceId: credit.id, sourceType: 'vendor_credit', isVoided: false },
      select: { id: true },
    })
    for (const posting of postings) {
      await reverseTransaction(tx, posting.id, {
        date: credit.date,
        description: `VOID vendor credit ${credit.creditNumber}`,
      })
    }

    // The goods come back on hand at the price they went out at.
    for (const line of lines) {
      if (line.itemId == null) continue
      const item = items.get(line.itemId)
      if (!item?.trackInventory) continue
      if (!line.quantity.greaterThan(0)) continue
      await recordMovement(tx, {
        itemId: item.id,
        type: InventoryMovementType.VOID,
        quantity: line.quantity,
        unitCost: line.rate,
        date: credit.date,
        reference: `VOID vendor credit ${credit.creditNumber}`,
        sourceType: 'vendor_credit_void',
        sourceId: credit.id,
      })
    }

    await tx.vendorCredit.update({
      where: { id: credit.id },
      data: {
        status: VendorCreditStatus.VOID,
        amountApplied: '0.00',
        balanceRemaining: '0.00',
      },
    })

    return { id: credit.id }
  })
}

// ---------------------------------------------------------------------------
// Expenses and credit-card charges — ledger-only documents
// ---------------------------------------------------------------------------

export type ExpenseInput = {
  date: Date
  vendorId?: number | null
  payee?: string | null
  expenseAccountId: number
  paidFromAccountId: number
  amount: Decimal.Value
  reference?: string | null
  memo?: string | null
  classId?: number | null
  jobId?: number | null
  costCodeId?: number | null
  functionCode?: string | null
  isBillable?: boolean
}

/**
 * A paid receipt. There is no expense table: the transaction *is* the
 * document, which is why the expense id in the UI is a transaction id.
 */
export async function recordExpense(db: TenantClient, input: ExpenseInput) {
  await assertPostable(db, input.date)
  const amount = cents(input.amount)
  if (!amount.greaterThan(0)) throw new PurchasingError('An expense must be more than zero.')
  if (input.expenseAccountId === input.paidFromAccountId) {
    throw new PurchasingError('The expense and the account it was paid from must be different.')
  }

  const [expenseAccount, paidFrom] = await Promise.all([
    db.account.findUnique({ where: { id: input.expenseAccountId } }),
    db.account.findUnique({ where: { id: input.paidFromAccountId } }),
  ])
  if (!expenseAccount) throw new PurchasingError('That expense account no longer exists.', 404)
  if (!paidFrom) throw new PurchasingError('That payment account no longer exists.', 404)
  if (paidFrom.accountType !== 'ASSET' && paidFrom.accountType !== 'LIABILITY') {
    throw new PurchasingError('Money comes out of a bank, cash or credit-card account.')
  }

  const vendor = input.vendorId ? await loadVendor(db, input.vendorId) : null
  const payee = nullable(input.payee) ?? vendor?.name ?? null
  const memo = nullable(input.memo)
  const lineDescription = memo ?? payee ?? 'Expense'

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: payee ? `Expense: ${payee}` : 'Expense',
      reference: nullable(input.reference),
      sourceType: 'expense',
      sourceId: vendor?.id ?? null,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: [
        {
          accountId: expenseAccount.id,
          debit: amount,
          description: lineDescription,
          jobId: input.jobId ?? null,
          classId: input.classId ?? null,
          costCodeId: input.costCodeId ?? null,
          function: input.functionCode ?? null,
          isBillable: input.isBillable ?? false,
        },
        { accountId: paidFrom.id, credit: amount, description: lineDescription },
      ],
    })
    return { id: entry.id, amount }
  })
}

export type CardChargeInput = {
  date: Date
  vendorId?: number | null
  payee?: string | null
  expenseAccountId: number
  cardAccountId?: number | null
  amount: Decimal.Value
  reference?: string | null
  memo?: string | null
  classId?: number | null
  jobId?: number | null
  costCodeId?: number | null
}

/** A card charge: the same shape as an expense, with the card as the credit. */
export async function recordCardCharge(db: TenantClient, input: CardChargeInput) {
  await assertPostable(db, input.date)
  const amount = cents(input.amount)
  if (!amount.greaterThan(0)) throw new PurchasingError('A charge must be more than zero.')

  const accounts = await purchasingAccounts(db)
  const cardId = input.cardAccountId ?? accounts.creditCard
  const [expenseAccount, card] = await Promise.all([
    db.account.findUnique({ where: { id: input.expenseAccountId } }),
    db.account.findUnique({ where: { id: cardId } }),
  ])
  if (!expenseAccount) throw new PurchasingError('That expense account no longer exists.', 404)
  if (!card) throw new PurchasingError('That card account no longer exists.', 404)
  if (card.accountType !== 'LIABILITY') {
    throw new PurchasingError(`${card.name} is not a credit-card account.`)
  }

  const vendor = input.vendorId ? await loadVendor(db, input.vendorId) : null
  const payee = nullable(input.payee) ?? vendor?.name ?? null
  const description = nullable(input.memo) ?? payee ?? 'Credit card charge'

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: payee ? `Card charge: ${payee}` : 'Credit card charge',
      reference: nullable(input.reference),
      sourceType: 'cc_charge',
      sourceId: vendor?.id ?? null,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: [
        {
          accountId: expenseAccount.id,
          debit: amount,
          description,
          jobId: input.jobId ?? null,
          classId: input.classId ?? null,
          costCodeId: input.costCodeId ?? null,
        },
        { accountId: card.id, credit: amount, description },
      ],
    })
    return { id: entry.id, amount }
  })
}

/** Void a ledger-only document by reversal; the original entry stays put. */
export async function voidLedgerDocument(db: TenantClient, transactionId: number) {
  const entry = await db.transaction.findUnique({
    where: { id: transactionId },
    include: { transactionLines: true },
  })
  if (!entry) throw new PurchasingError('That entry could not be found.', 404)
  if (entry.sourceType !== 'expense' && entry.sourceType !== 'cc_charge') {
    throw new PurchasingError('Only an expense or a card charge is voided this way.')
  }
  if (entry.isVoided) throw new PurchasingError('This entry is already voided.')
  if (entry.transactionLines.some((line) => line.reconciliationId != null)) {
    throw new PurchasingError('This entry is part of a completed reconciliation and cannot be voided.')
  }
  await assertPostable(db, entry.date)

  await reverseTransaction(db, entry.id, {
    date: entry.date,
    description: `VOID ${entry.description ?? 'entry'}`,
  })
  return { id: entry.id }
}

/** Expenses and card charges, newest first — the list both pages read. */
export function ledgerDocuments(
  db: TenantClient,
  args: { sourceTypes: string[]; where?: Prisma.TransactionWhereInput; skip?: number; take?: number },
) {
  return db.transaction.findMany({
    where: { sourceType: { in: args.sourceTypes }, ...(args.where ?? {}) },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    skip: args.skip,
    take: args.take,
    include: { transactionLines: { include: { account: true } } },
  })
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export type ApAgingRow = {
  vendorId: number
  vendorName: string
  current: Decimal
  over30: Decimal
  over60: Decimal
  over90: Decimal
  unappliedCredits: Decimal
  total: Decimal
}

/**
 * What is owed, by how late it is.
 *
 * An unapplied vendor credit has no due date — it is money available now — so
 * it comes off "current" and off the total. That is what keeps the payables
 * sub-ledger tied to account 2000, which a bills-only sum overstates.
 */
export async function apAging(db: TenantClient, asOf: Date = startOfToday()): Promise<{
  rows: ApAgingRow[]
  totals: Omit<ApAgingRow, 'vendorId' | 'vendorName'>
}> {
  const [bills, credits] = await Promise.all([
    db.bill.findMany({
      where: {
        status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] },
        balanceDue: { gt: 0 },
        date: { lte: asOf },
      },
      include: { vendor: { select: { id: true, name: true } } },
    }),
    db.vendorCredit.findMany({
      where: {
        status: { not: VendorCreditStatus.VOID },
        balanceRemaining: { gt: 0 },
        date: { lte: asOf },
      },
      include: { vendor: { select: { id: true, name: true } } },
    }),
  ])

  const byVendor = new Map<number, ApAgingRow>()
  const blank = (id: number, name: string): ApAgingRow => ({
    vendorId: id,
    vendorName: name,
    current: ZERO,
    over30: ZERO,
    over60: ZERO,
    over90: ZERO,
    unappliedCredits: ZERO,
    total: ZERO,
  })

  for (const bill of bills) {
    const row = byVendor.get(bill.vendorId) ?? blank(bill.vendorId, bill.vendor.name)
    const balance = money(bill.balanceDue.toString())
    const due = bill.dueDate ?? bill.date
    const days = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000)
    if (days <= 0) row.current = row.current.plus(balance)
    else if (days <= 30) row.over30 = row.over30.plus(balance)
    else if (days <= 60) row.over60 = row.over60.plus(balance)
    else row.over90 = row.over90.plus(balance)
    row.total = row.total.plus(balance)
    byVendor.set(bill.vendorId, row)
  }

  for (const credit of credits) {
    const row = byVendor.get(credit.vendorId) ?? blank(credit.vendorId, credit.vendor.name)
    const balance = money(credit.balanceRemaining.toString())
    row.unappliedCredits = row.unappliedCredits.plus(balance)
    row.current = row.current.minus(balance)
    row.total = row.total.minus(balance)
    byVendor.set(credit.vendorId, row)
  }

  const rows = [...byVendor.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName))
  const totals = {
    current: cents(sum(rows.map((r) => r.current))),
    over30: cents(sum(rows.map((r) => r.over30))),
    over60: cents(sum(rows.map((r) => r.over60))),
    over90: cents(sum(rows.map((r) => r.over90))),
    unappliedCredits: cents(sum(rows.map((r) => r.unappliedCredits))),
    total: cents(sum(rows.map((r) => r.total))),
  }
  return { rows, totals }
}

export const NEC_THRESHOLD = new Decimal('600.00')

export type Vendor1099Row = {
  vendorId: number
  name: string
  companyName: string | null
  address: string
  taxId: string | null
  formType: string
  w9OnFile: boolean
  totalPaid: Decimal
  reportable: boolean
}

/**
 * 1099-NEC candidates for a calendar year.
 *
 * Upstream shipped two versions of this — one keyed on `is_1099_eligible` with
 * payment headers, one on `is_1099_vendor` with allocations, neither excluding
 * voided payments. This is the unified one: a vendor counts when either flag is
 * set, the money is what was actually allocated to bills, and voided payments
 * do not count.
 *
 * Thresholds and form layouts change; check the current-year IRS instructions
 * before filing anything from this.
 */
export async function vendor1099Summary(db: TenantClient, year: number) {
  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year, 11, 31))

  const vendors = await db.vendor.findMany({
    where: { OR: [{ is1099Vendor: true }, { is1099Eligible: true }] },
    orderBy: { name: 'asc' },
  })
  if (vendors.length === 0) {
    return { year, threshold: NEC_THRESHOLD, rows: [] as Vendor1099Row[], total: ZERO, reportableCount: 0 }
  }

  const allocations = await db.billPaymentAllocation.findMany({
    where: {
      billPayment: { isVoided: false, date: { gte: from, lte: to } },
      bill: { vendorId: { in: vendors.map((v) => v.id) } },
    },
    select: { amount: true, billPayment: { select: { vendorId: true } } },
  })

  const paid = new Map<number, Decimal>()
  for (const allocation of allocations) {
    const vendorId = allocation.billPayment.vendorId
    paid.set(vendorId, (paid.get(vendorId) ?? ZERO).plus(money(allocation.amount.toString())))
  }

  const rows: Vendor1099Row[] = vendors.map((vendor) => {
    const totalPaid = cents(paid.get(vendor.id) ?? ZERO)
    const locality = [vendor.city ? `${vendor.city},` : '', vendor.state ?? '', vendor.zip ?? '']
      .filter((part) => part.trim() !== '')
      .join(' ')
      .trim()
    return {
      vendorId: vendor.id,
      name: vendor.name,
      companyName: vendor.companyName,
      address: [vendor.address1, vendor.address2, locality]
        .filter((part) => part && part.trim() !== '')
        .join(', '),
      taxId: vendor.taxId,
      formType: vendor.vendor1099Type ?? 'NEC',
      w9OnFile: vendor.w9OnFile,
      totalPaid,
      reportable: totalPaid.greaterThanOrEqualTo(NEC_THRESHOLD),
    }
  })

  rows.sort((a, b) => b.totalPaid.comparedTo(a.totalPaid) || a.name.localeCompare(b.name))
  const reportable = rows.filter((row) => row.reportable)

  return {
    year,
    threshold: NEC_THRESHOLD,
    rows,
    total: cents(sum(reportable.map((row) => row.totalPaid))),
    reportableCount: reportable.length,
  }
}

// ---------------------------------------------------------------------------
// Failure messages
// ---------------------------------------------------------------------------

/**
 * Turn an expected failure into something a person can act on. Anything this
 * does not recognise is a bug, not a user error: it gets a neutral message and
 * the real one stays in the server log.
 */
export function describePurchasingFailure(error: unknown): string {
  if (error instanceof PurchasingError) return error.message
  if (error instanceof UnknownItemError) return 'One of the items on this document no longer exists.'
  if (error instanceof ClosedPeriodError) {
    return `${error.message}. Change the date, or ask an admin to move the closing date.`
  }
  if (error instanceof ForbiddenError) return error.message
  if (error instanceof UnbalancedEntryError) {
    return 'This document does not balance. Check the quantities, rates and tax rate, then try again.'
  }
  return 'Something went wrong saving this. Nothing was changed — please try again.'
}
