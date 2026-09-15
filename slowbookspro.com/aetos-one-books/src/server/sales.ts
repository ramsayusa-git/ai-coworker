import 'server-only'
import { Decimal } from 'decimal.js'
import { cents, extend, money, qty as quantizeQty, sum, ZERO } from '@/lib/money'
import type { TenantClient } from '@/lib/tenant-db'
import {
  CreditMemoStatus,
  EstimateStatus,
  InvoiceStatus,
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
import { recordReturnIn, recordReturnOut, recordSale, reverseSale, UnknownItemError } from './inventory'

/**
 * Sales and accounts receivable: customers, items, invoices, estimates,
 * customer payments and credit memos.
 *
 * Three rules shape everything below.
 *
 *  1. **Round per line, then sum.** A line extension is rounded to cents before
 *     it is added to anything. Summing first and rounding once produces journal
 *     entries that do not balance for fractional quantities or sub-cent rates.
 *  2. **A document and its GL effect commit together.** Every mutation that
 *     posts runs inside one `db.$transaction`, and the entry goes through
 *     `postJournalEntry` — never a direct write to transaction lines.
 *  3. **Posted history is append-only.** An edit or a void never rewrites an
 *     entry; it reverses the old one through `reverseTransaction` and, when the
 *     document still exists, posts a fresh one.
 *
 * Expected failures (a closed period, a void document, an over-application)
 * throw `SalesError`, which the server actions translate into a message beside
 * the field. Anything else is a programming error and is allowed to escape.
 */

type Tx = Prisma.TransactionClient
/** Inside an interactive transaction Prisma hands back a narrower client. */
const asClient = (tx: Tx): TenantClient => tx as unknown as TenantClient

export class SalesError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = 'SalesError'
  }
}

// ---------------------------------------------------------------------------
// Settings, numbering, terms
// ---------------------------------------------------------------------------

async function readSettings(db: TenantClient, keys: string[]) {
  const rows = await db.setting.findMany({ where: { key: { in: keys } } })
  return new Map(rows.map((row) => [row.key, row.value ?? '']))
}

/** The org's word for an invoice — nonprofit installations issue pledges. */
export async function documentLabel(db: TenantClient) {
  const settings = await readSettings(db, ['nonprofit_mode'])
  return settings.get('nonprofit_mode') === 'true' ? 'Pledge' : 'Invoice'
}

/**
 * Propose the next number in a series: honour the settings counter, never
 * collide with a number already used, and preserve zero-fill.
 */
async function nextNumber(args: {
  prefix: string
  seed: number
  taken: (candidate: string) => Promise<boolean>
  lastUsed: () => Promise<string | null>
}): Promise<string> {
  let pad = 0
  let n = args.seed

  const last = await args.lastUsed()
  if (last && last.startsWith(args.prefix)) {
    const digits = last.slice(args.prefix.length)
    if (digits.length > 0 && /^\d+$/.test(digits)) {
      n = Math.max(n, Number.parseInt(digits, 10) + 1)
      pad = digits.length
    }
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${args.prefix}${String(n).padStart(pad, '0')}`
    if (!(await args.taken(candidate))) return candidate
    n += 1
  }
  throw new SalesError('Could not assign a unique document number — please retry.', 503)
}

async function nextInvoiceNumber(tx: TenantClient) {
  const settings = await readSettings(tx, ['invoice_prefix', 'invoice_next_number'])
  const prefix = settings.get('invoice_prefix') ?? 'INV-'
  const seed = Number.parseInt(settings.get('invoice_next_number') ?? '', 10)
  const number = await nextNumber({
    prefix,
    seed: Number.isFinite(seed) ? seed : 1000,
    lastUsed: async () =>
      (
        await tx.invoice.findFirst({
          where: { invoiceNumber: { startsWith: prefix } },
          orderBy: { invoiceNumber: 'desc' },
          select: { invoiceNumber: true },
        })
      )?.invoiceNumber ?? null,
    taken: async (candidate) => (await tx.invoice.count({ where: { invoiceNumber: candidate } })) > 0,
  })
  await advanceCounter(tx, 'invoice_next_number', prefix, number)
  return number
}

async function nextEstimateNumber(tx: TenantClient) {
  const settings = await readSettings(tx, ['estimate_prefix', 'estimate_next_number'])
  const prefix = settings.get('estimate_prefix') ?? 'EST-'
  const seed = Number.parseInt(settings.get('estimate_next_number') ?? '', 10)
  const number = await nextNumber({
    prefix,
    seed: Number.isFinite(seed) ? seed : 1000,
    lastUsed: async () =>
      (
        await tx.estimate.findFirst({
          where: { estimateNumber: { startsWith: prefix } },
          orderBy: { estimateNumber: 'desc' },
          select: { estimateNumber: true },
        })
      )?.estimateNumber ?? null,
    taken: async (candidate) =>
      (await tx.estimate.count({ where: { estimateNumber: candidate } })) > 0,
  })
  await advanceCounter(tx, 'estimate_next_number', prefix, number)
  return number
}

async function nextCreditMemoNumber(tx: TenantClient) {
  const settings = await readSettings(tx, ['credit_memo_prefix'])
  const prefix = settings.get('credit_memo_prefix') ?? 'CM-'
  return nextNumber({
    prefix,
    seed: 1,
    lastUsed: async () =>
      (
        await tx.creditMemo.findFirst({
          where: { memoNumber: { startsWith: prefix } },
          orderBy: { memoNumber: 'desc' },
          select: { memoNumber: true },
        })
      )?.memoNumber ?? null,
    taken: async (candidate) => (await tx.creditMemo.count({ where: { memoNumber: candidate } })) > 0,
  })
}

async function advanceCounter(tx: TenantClient, key: string, prefix: string, assigned: string) {
  const digits = assigned.slice(prefix.length)
  if (!/^\d+$/.test(digits)) return
  await tx.setting.upsert({
    where: { key },
    update: { value: String(Number.parseInt(digits, 10) + 1) },
    create: { key, value: String(Number.parseInt(digits, 10) + 1) },
  })
}

const DAY_MS = 86_400_000
const IMMEDIATE_TERMS = new Set(['due on receipt', 'due upon receipt', 'cod', 'net 0'])

/** Terms to a due date: "Net 30" → date + 30 days, "Due on receipt" → date. */
export function dueDateFromTerms(base: Date, terms?: string | null): Date {
  const normalised = (terms ?? '').trim().toLowerCase()
  if (!normalised) return new Date(base.getTime() + 30 * DAY_MS)
  if (IMMEDIATE_TERMS.has(normalised)) return new Date(base.getTime())
  const days = Number.parseInt(normalised.replace('net', '').trim(), 10)
  if (!Number.isFinite(days)) return new Date(base.getTime() + 30 * DAY_MS)
  return new Date(base.getTime() + days * DAY_MS)
}

export const TERMS_OPTIONS = [
  'Due on receipt',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Net 90',
] as const

// ---------------------------------------------------------------------------
// Line maths
// ---------------------------------------------------------------------------

export type SalesLineInput = {
  itemId?: number | null
  description?: string | null
  quantity: Decimal.Value
  rate: Decimal.Value
  /** `null` means "decide from the item and the customer". */
  isTaxable?: boolean | null
  jobId?: number | null
  classId?: number | null
  lineOrder?: number
}

export type PricedLine = SalesLineInput & { amount: Decimal; isTaxable: boolean }

export type DocumentTotals = {
  lines: PricedLine[]
  subtotal: Decimal
  taxableSubtotal: Decimal
  taxAmount: Decimal
  total: Decimal
}

/**
 * Price a document: extend every line to cents first, decide its taxability,
 * then sum. Tax is charged on the taxable subtotal only.
 */
export function priceDocument(
  input: SalesLineInput[],
  taxRate: Decimal.Value,
  context: { customerTaxable?: boolean; itemTaxable?: Map<number, boolean> } = {},
): DocumentTotals {
  const customerTaxable = context.customerTaxable !== false
  const rate = money(taxRate)

  const lines: PricedLine[] = input.map((line, index) => {
    let taxable = line.isTaxable
    if (taxable === null || taxable === undefined) {
      taxable = customerTaxable
      if (taxable && line.itemId != null) {
        const itemTaxable = context.itemTaxable?.get(line.itemId)
        if (itemTaxable === false) taxable = false
      }
    }
    return {
      ...line,
      lineOrder: line.lineOrder ?? index,
      isTaxable: taxable,
      amount: extend(line.quantity, line.rate),
    }
  })

  const subtotal = cents(sum(lines.map((l) => l.amount)))
  const taxableSubtotal = cents(sum(lines.filter((l) => l.isTaxable).map((l) => l.amount)))
  const taxAmount = cents(taxableSubtotal.times(rate))
  return { lines, subtotal, taxableSubtotal, taxAmount, total: cents(subtotal.plus(taxAmount)) }
}

function assertTaxRate(taxRate: Decimal.Value) {
  const rate = money(taxRate)
  if (rate.isNegative()) throw new SalesError('The tax rate cannot be negative.')
  if (rate.greaterThan(1)) {
    throw new SalesError(
      'The tax rate is a fraction of the subtotal (0.089 = 8.9%). Divide the percentage by 100.',
    )
  }
}

function assertLines(lines: SalesLineInput[], noun: string) {
  if (lines.length === 0) throw new SalesError(`Add at least one line to this ${noun}.`)
  for (const [index, line] of lines.entries()) {
    if (money(line.quantity).isNegative()) {
      throw new SalesError(
        `Line ${index + 1}: quantity cannot be negative. Use a credit memo for a refund.`,
      )
    }
    if (money(line.rate).isNegative()) {
      throw new SalesError(
        `Line ${index + 1}: rate cannot be negative. Use a credit memo for a refund.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Control accounts
// ---------------------------------------------------------------------------

export type SalesAccounts = {
  receivable: number
  income: number
  salesTax: number
  undeposited: number
  inventory: number
  cogs: number
  badDebt: number
}

/**
 * Resolved once, outside the transaction, so a missing control account fails
 * before anything is written.
 */
export async function salesAccounts(db: TenantClient): Promise<SalesAccounts> {
  const [receivable, income, salesTax, undeposited, inventory, cogs, badDebt] = await Promise.all([
    controlAccountId(db, CONTROL_ACCOUNTS.ACCOUNTS_RECEIVABLE),
    controlAccountId(db, CONTROL_ACCOUNTS.SALES),
    controlAccountId(db, CONTROL_ACCOUNTS.SALES_TAX_PAYABLE),
    controlAccountId(db, CONTROL_ACCOUNTS.UNDEPOSITED_FUNDS),
    controlAccountId(db, CONTROL_ACCOUNTS.INVENTORY),
    controlAccountId(db, CONTROL_ACCOUNTS.COGS),
    controlAccountId(db, CONTROL_ACCOUNTS.BAD_DEBT),
  ])
  return { receivable, income, salesTax, undeposited, inventory, cogs, badDebt }
}

type ItemFacts = {
  id: number
  name: string
  isTaxable: boolean
  trackInventory: boolean
  incomeAccountId: number | null
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
      isTaxable: true,
      trackInventory: true,
      incomeAccountId: true,
      assetAccountId: true,
    },
  })
  if (items.length !== ids.length) throw new SalesError('One of the items on this document no longer exists.')
  return new Map(items.map((item) => [item.id, item]))
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type CustomerInput = {
  name: string
  companyName?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  website?: string | null
  billAddress1?: string | null
  billAddress2?: string | null
  billCity?: string | null
  billState?: string | null
  billZip?: string | null
  shipAddress1?: string | null
  shipAddress2?: string | null
  shipCity?: string | null
  shipState?: string | null
  shipZip?: string | null
  terms?: string | null
  creditLimit?: Decimal.Value | null
  taxId?: string | null
  isTaxable?: boolean
  notes?: string | null
  isActive?: boolean
}

const nullable = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function createCustomer(db: TenantClient, input: CustomerInput) {
  const name = input.name.trim()
  const clash = await db.customer.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
    select: { id: true },
  })
  if (clash) throw new SalesError('A customer with that name already exists.', 409)

  return db.customer.create({ data: customerData(input) })
}

export async function updateCustomer(db: TenantClient, id: number, input: CustomerInput) {
  const existing = await db.customer.findUnique({ where: { id } })
  if (!existing) throw new SalesError('Customer not found.', 404)
  return db.customer.update({ where: { id }, data: customerData(input) })
}

/** Customers are never deleted — history points at them. They deactivate. */
export async function setCustomerActive(db: TenantClient, id: number, isActive: boolean) {
  const existing = await db.customer.findUnique({ where: { id } })
  if (!existing) throw new SalesError('Customer not found.', 404)
  return db.customer.update({ where: { id }, data: { isActive } })
}

function customerData(input: CustomerInput) {
  return {
    name: input.name.trim(),
    companyName: nullable(input.companyName),
    email: nullable(input.email)?.toLowerCase() ?? null,
    phone: nullable(input.phone),
    mobile: nullable(input.mobile),
    website: nullable(input.website),
    billAddress1: nullable(input.billAddress1),
    billAddress2: nullable(input.billAddress2),
    billCity: nullable(input.billCity),
    billState: nullable(input.billState),
    billZip: nullable(input.billZip),
    shipAddress1: nullable(input.shipAddress1),
    shipAddress2: nullable(input.shipAddress2),
    shipCity: nullable(input.shipCity),
    shipState: nullable(input.shipState),
    shipZip: nullable(input.shipZip),
    terms: nullable(input.terms) ?? 'Net 30',
    creditLimit: input.creditLimit == null ? null : money(input.creditLimit).toFixed(2),
    taxId: nullable(input.taxId),
    isTaxable: input.isTaxable ?? true,
    notes: nullable(input.notes),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  }
}

/** Open balance per customer, derived from invoices rather than the cache column. */
export async function customerBalances(db: TenantClient, customerIds: number[]) {
  if (customerIds.length === 0) return new Map<number, Decimal>()
  const rows = await db.invoice.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: { not: InvoiceStatus.VOID } },
    _sum: { balanceDue: true },
  })
  return new Map(rows.map((row) => [row.customerId, money(row._sum.balanceDue?.toString() ?? 0)]))
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemInput = {
  name: string
  itemType: 'PRODUCT' | 'SERVICE' | 'MATERIAL' | 'LABOR'
  description?: string | null
  rate?: Decimal.Value
  cost?: Decimal.Value
  incomeAccountId?: number | null
  expenseAccountId?: number | null
  assetAccountId?: number | null
  isTaxable?: boolean
  trackInventory?: boolean
  reorderPoint?: Decimal.Value
  isActive?: boolean
}

export async function createItem(db: TenantClient, input: ItemInput) {
  const name = input.name.trim()
  const clash = await db.item.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
    select: { id: true },
  })
  if (clash) throw new SalesError('An item with that name already exists.', 409)
  return db.item.create({ data: itemData(input) })
}

export async function updateItem(db: TenantClient, id: number, input: ItemInput) {
  const existing = await db.item.findUnique({ where: { id } })
  if (!existing) throw new SalesError('Item not found.', 404)
  // Quantity and average cost are owned by the inventory ledger, never by a form.
  return db.item.update({ where: { id }, data: itemData(input) })
}

export async function setItemActive(db: TenantClient, id: number, isActive: boolean) {
  const existing = await db.item.findUnique({ where: { id } })
  if (!existing) throw new SalesError('Item not found.', 404)
  return db.item.update({ where: { id }, data: { isActive } })
}

function itemData(input: ItemInput) {
  return {
    name: input.name.trim(),
    itemType: input.itemType,
    description: nullable(input.description),
    rate: money(input.rate ?? 0).toFixed(2),
    cost: money(input.cost ?? 0).toFixed(2),
    incomeAccountId: input.incomeAccountId ?? null,
    expenseAccountId: input.expenseAccountId ?? null,
    assetAccountId: input.assetAccountId ?? null,
    isTaxable: input.isTaxable ?? true,
    trackInventory: input.trackInventory ?? false,
    reorderPoint: quantizeQty(input.reorderPoint ?? 0).toFixed(4),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  }
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceInput = {
  customerId: number
  date: Date
  dueDate?: Date | null
  terms?: string | null
  poNumber?: string | null
  taxRate?: Decimal.Value
  notes?: string | null
  classId?: number | null
  jobId?: number | null
  lines: SalesLineInput[]
}

type PreparedInvoice = {
  totals: DocumentTotals
  items: Map<number, ItemFacts>
  customer: { id: number; name: string; isTaxable: boolean; terms: string | null }
  dueDate: Date
}

async function prepareInvoice(db: TenantClient, input: InvoiceInput): Promise<PreparedInvoice> {
  assertLines(input.lines, 'invoice')
  assertTaxRate(input.taxRate ?? 0)

  const customer = await db.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, isTaxable: true, terms: true },
  })
  if (!customer) throw new SalesError('Customer not found.', 404)

  const items = await loadItems(db, input.lines)
  const totals = priceDocument(input.lines, input.taxRate ?? 0, {
    customerTaxable: customer.isTaxable,
    itemTaxable: new Map([...items.values()].map((i) => [i.id, i.isTaxable])),
  })

  const terms = input.terms ?? customer.terms ?? 'Net 30'
  return { totals, items, customer, dueDate: input.dueDate ?? dueDateFromTerms(input.date, terms) }
}

/** The revenue side of an invoice: AR debited, income and tax credited. */
function invoiceJournalLines(args: {
  accounts: SalesAccounts
  items: Map<number, ItemFacts>
  lines: PricedLine[]
  total: Decimal
  taxAmount: Decimal
  reference: string
  customerName: string
}): JournalLine[] {
  const lines: JournalLine[] = [
    {
      accountId: args.accounts.receivable,
      debit: args.total,
      description: `${args.reference} — ${args.customerName}`,
    },
  ]

  for (const line of args.lines) {
    if (line.amount.isZero()) continue
    const item = line.itemId != null ? args.items.get(line.itemId) : undefined
    lines.push({
      accountId: item?.incomeAccountId ?? args.accounts.income,
      credit: line.amount,
      description: line.description ?? item?.name ?? args.reference,
      jobId: line.jobId ?? null,
      classId: line.classId ?? null,
    })
  }

  if (args.taxAmount.isPositive()) {
    lines.push({
      accountId: args.accounts.salesTax,
      credit: args.taxAmount,
      description: 'Sales tax',
    })
  }

  return lines
}

/**
 * Issue stock for every inventory-tracked line and post the matching
 * `DR cost of goods sold / CR inventory` entry as one balanced document.
 */
async function postCostOfSales(
  tx: TenantClient,
  args: {
    accounts: SalesAccounts
    items: Map<number, ItemFacts>
    lines: { itemId?: number | null; quantity: Decimal.Value }[]
    date: Date
    reference: string
    sourceId: number
    sourceType?: string
  },
) {
  const movementIds: number[] = []
  const byAsset = new Map<number, Decimal>()
  let totalCogs = ZERO

  for (const line of args.lines) {
    if (line.itemId == null) continue
    const item = args.items.get(line.itemId)
    if (!item?.trackInventory) continue

    const movement = await recordSale(tx, {
      itemId: item.id,
      quantity: line.quantity,
      date: args.date,
      reference: args.reference,
      sourceType: 'invoice',
      sourceId: args.sourceId,
    })
    if (!movement) continue

    movementIds.push(movement.movementId)
    if (movement.cogs.isZero()) continue
    const assetId = item.assetAccountId ?? args.accounts.inventory
    byAsset.set(assetId, (byAsset.get(assetId) ?? ZERO).plus(movement.cogs))
    totalCogs = totalCogs.plus(movement.cogs)
  }

  if (movementIds.length === 0) return

  if (totalCogs.isPositive()) {
    const lines: JournalLine[] = [
      { accountId: args.accounts.cogs, debit: totalCogs, description: `Cost of goods sold — ${args.reference}` },
      ...[...byAsset.entries()].map(([accountId, amount]) => ({
        accountId,
        credit: amount,
        description: `Inventory relieved — ${args.reference}`,
      })),
    ]
    const entry = await postJournalEntry(tx, {
      date: args.date,
      description: `Cost of goods sold — ${args.reference}`,
      reference: args.reference,
      sourceType: args.sourceType ?? 'invoice_cogs',
      sourceId: args.sourceId,
      lines,
    })
    await tx.inventoryMovement.updateMany({
      where: { id: { in: movementIds } },
      data: { transactionId: entry.id },
    })
  }
}

/** Create and post an invoice. Returns the new invoice id and its number. */
export async function createInvoice(db: TenantClient, input: InvoiceInput) {
  await assertPostable(db, input.date)
  const prepared = await prepareInvoice(db, input)
  const accounts = await salesAccounts(db)
  const label = await documentLabel(db)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const invoiceNumber = await nextInvoiceNumber(tx)
    const { totals, items, customer, dueDate } = prepared

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        status: InvoiceStatus.DRAFT,
        date: input.date,
        dueDate,
        terms: input.terms ?? customer.terms ?? 'Net 30',
        poNumber: nullable(input.poNumber),
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        amountPaid: '0.00',
        balanceDue: totals.total.toFixed(2),
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        isPledge: label === 'Pledge',
        invoiceLines: {
          create: totals.lines.map((line, index) => ({
            itemId: line.itemId ?? null,
            description: nullable(line.description),
            quantity: quantizeQty(line.quantity).toFixed(4),
            rate: money(line.rate).toFixed(2),
            amount: line.amount.toFixed(2),
            isTaxable: line.isTaxable,
            jobId: line.jobId ?? null,
            classId: line.classId ?? null,
            lineOrder: line.lineOrder ?? index,
          })),
        },
      },
    })

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `${label} ${invoiceNumber} — ${customer.name}`,
      reference: invoiceNumber,
      sourceType: 'invoice',
      sourceId: invoice.id,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: invoiceJournalLines({
        accounts,
        items,
        lines: totals.lines,
        total: totals.total,
        taxAmount: totals.taxAmount,
        reference: `${label} ${invoiceNumber}`,
        customerName: customer.name,
      }),
    })

    await tx.invoice.update({ where: { id: invoice.id }, data: { transactionId: entry.id } })

    await postCostOfSales(tx, {
      accounts,
      items,
      lines: totals.lines,
      date: input.date,
      reference: invoiceNumber,
      sourceId: invoice.id,
    })

    return { id: invoice.id, invoiceNumber }
  })
}

/**
 * Edit an invoice. The old entry is reversed and a new one posted, so the
 * journal keeps both the original and the correction rather than pretending
 * the first version never happened.
 */
export async function updateInvoice(db: TenantClient, id: number, input: InvoiceInput) {
  const existing = await db.invoice.findUnique({
    where: { id },
    include: { invoiceLines: true },
  })
  if (!existing) throw new SalesError('Invoice not found.', 404)
  if (existing.status === InvoiceStatus.VOID) throw new SalesError('A voided invoice cannot be edited.')

  await assertPostable(db, existing.date)
  await assertPostable(db, input.date)

  const prepared = await prepareInvoice(db, input)
  const accounts = await salesAccounts(db)
  const label = await documentLabel(db)
  const amountPaid = money(existing.amountPaid.toString())

  if (prepared.totals.total.lessThan(amountPaid)) {
    throw new SalesError(
      `This invoice already has ${amountPaid.toFixed(2)} applied to it. Lower the payment before reducing the total below it.`,
    )
  }

  // The lines as they stood, so the inventory issued by the old version can be
  // put back before the new version issues its own.
  const previousLines = existing.invoiceLines.map((line) => ({
    itemId: line.itemId,
    quantity: quantizeQty(line.quantity.toString()),
  }))
  const previousItems = await loadItems(db, previousLines)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const { totals, items, customer, dueDate } = prepared

    await reverseInvoicePostings(tx, {
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
      date: existing.date,
      lines: previousLines,
      items: previousItems,
      reason: 'edit',
    })

    await tx.invoiceLine.deleteMany({ where: { invoiceId: existing.id } })

    const balanceDue = cents(totals.total.minus(amountPaid))
    await tx.invoice.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        date: input.date,
        dueDate,
        terms: input.terms ?? customer.terms ?? 'Net 30',
        poNumber: nullable(input.poNumber),
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        balanceDue: balanceDue.toFixed(2),
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        status: settledStatus(existing.status, amountPaid, balanceDue),
        invoiceLines: {
          create: totals.lines.map((line, index) => ({
            itemId: line.itemId ?? null,
            description: nullable(line.description),
            quantity: quantizeQty(line.quantity).toFixed(4),
            rate: money(line.rate).toFixed(2),
            amount: line.amount.toFixed(2),
            isTaxable: line.isTaxable,
            jobId: line.jobId ?? null,
            classId: line.classId ?? null,
            lineOrder: line.lineOrder ?? index,
          })),
        },
      },
    })

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `${label} ${existing.invoiceNumber} (revised) — ${customer.name}`,
      reference: existing.invoiceNumber,
      sourceType: 'invoice',
      sourceId: existing.id,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: invoiceJournalLines({
        accounts,
        items,
        lines: totals.lines,
        total: totals.total,
        taxAmount: totals.taxAmount,
        reference: `${label} ${existing.invoiceNumber}`,
        customerName: customer.name,
      }),
    })

    await tx.invoice.update({ where: { id: existing.id }, data: { transactionId: entry.id } })

    await postCostOfSales(tx, {
      accounts,
      items,
      lines: totals.lines,
      date: input.date,
      reference: existing.invoiceNumber,
      sourceId: existing.id,
    })

    return { id: existing.id, invoiceNumber: existing.invoiceNumber }
  })
}

/** Reverse every live posting an invoice made, and return its stock. */
async function reverseInvoicePostings(
  tx: TenantClient,
  args: {
    invoiceId: number
    invoiceNumber: string
    date: Date
    lines: { itemId: number | null; quantity: Decimal }[]
    items: Map<number, ItemFacts>
    reason: 'edit' | 'void'
  },
) {
  const postings = await tx.transaction.findMany({
    where: {
      sourceId: args.invoiceId,
      sourceType: { in: ['invoice', 'invoice_cogs'] },
      isVoided: false,
    },
    select: { id: true },
  })

  for (const posting of postings) {
    await reverseTransaction(tx, posting.id, {
      date: args.date,
      description:
        args.reason === 'void'
          ? `VOID Invoice ${args.invoiceNumber}`
          : `Revision of Invoice ${args.invoiceNumber}`,
    })
  }

  for (const line of args.lines) {
    if (line.itemId == null) continue
    const item = args.items.get(line.itemId)
    if (!item?.trackInventory) continue
    await reverseSale(tx, {
      itemId: item.id,
      quantity: line.quantity,
      date: args.date,
      reference: `${args.reason === 'void' ? 'VOID' : 'Revision of'} ${args.invoiceNumber}`,
      sourceType: args.reason === 'void' ? 'invoice_void' : 'invoice_edit',
      sourceId: args.invoiceId,
      originalSourceType: 'invoice',
      originalSourceId: args.invoiceId,
    })
  }
}

function settledStatus(current: InvoiceStatus, amountPaid: Decimal, balanceDue: Decimal) {
  if (current === InvoiceStatus.VOID) return InvoiceStatus.VOID
  if (balanceDue.isZero() && amountPaid.isPositive()) return InvoiceStatus.PAID
  if (amountPaid.isPositive()) return InvoiceStatus.PARTIAL
  return current === InvoiceStatus.DRAFT ? InvoiceStatus.DRAFT : InvoiceStatus.SENT
}

/** Mark a draft as sent — the point at which it becomes a live receivable. */
export async function sendInvoice(db: TenantClient, id: number) {
  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) throw new SalesError('Invoice not found.', 404)
  if (invoice.status === InvoiceStatus.VOID) throw new SalesError('This invoice is voided.')
  if (invoice.status !== InvoiceStatus.DRAFT) throw new SalesError('Only a draft invoice can be marked as sent.')
  await db.invoice.update({ where: { id }, data: { status: InvoiceStatus.SENT } })
  return { id }
}

export async function voidInvoice(db: TenantClient, id: number) {
  const invoice = await db.invoice.findUnique({ where: { id }, include: { invoiceLines: true } })
  if (!invoice) throw new SalesError('Invoice not found.', 404)
  if (invoice.status === InvoiceStatus.VOID) throw new SalesError('This invoice is already voided.')
  if (money(invoice.amountPaid.toString()).isPositive()) {
    throw new SalesError(
      'This invoice has payments applied. Void the payment first, then void the invoice.',
    )
  }
  await assertPostable(db, invoice.date)

  const lines = invoice.invoiceLines.map((line) => ({
    itemId: line.itemId,
    quantity: quantizeQty(line.quantity.toString()),
  }))
  const items = await loadItems(db, lines)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    await reverseInvoicePostings(tx, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      lines,
      items,
      reason: 'void',
    })
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.VOID, balanceDue: '0.00' },
    })
    return { id: invoice.id }
  })
}

/** Copy an invoice into a fresh draft dated today. */
export async function duplicateInvoice(db: TenantClient, id: number) {
  const source = await db.invoice.findUnique({
    where: { id },
    include: { invoiceLines: { orderBy: { lineOrder: 'asc' } } },
  })
  if (!source) throw new SalesError('Invoice not found.', 404)

  return createInvoice(db, {
    customerId: source.customerId,
    date: startOfToday(),
    terms: source.terms,
    poNumber: source.poNumber,
    taxRate: source.taxRate.toString(),
    notes: source.notes,
    classId: source.classId,
    lines: source.invoiceLines.map((line, index) => ({
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity.toString(),
      rate: line.rate.toString(),
      isTaxable: line.isTaxable,
      lineOrder: line.lineOrder ?? index,
    })),
  })
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

export type EstimateInput = {
  customerId: number
  date: Date
  expirationDate?: Date | null
  taxRate?: Decimal.Value
  notes?: string | null
  classId?: number | null
  jobId?: number | null
  lines: SalesLineInput[]
}

/** Estimates never post: they are not a financial event until converted. */
export async function createEstimate(db: TenantClient, input: EstimateInput) {
  const { totals, customer } = await prepareEstimate(db, input)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const estimateNumber = await nextEstimateNumber(tx)
    const estimate = await tx.estimate.create({
      data: {
        estimateNumber,
        customerId: customer.id,
        status: EstimateStatus.PENDING,
        date: input.date,
        expirationDate: input.expirationDate ?? null,
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        estimateLines: { create: estimateLineRows(totals) },
      },
    })
    return { id: estimate.id, estimateNumber }
  })
}

export async function updateEstimate(db: TenantClient, id: number, input: EstimateInput) {
  const existing = await db.estimate.findUnique({ where: { id } })
  if (!existing) throw new SalesError('Estimate not found.', 404)
  if (existing.status === EstimateStatus.CONVERTED) {
    throw new SalesError('This estimate has been converted to an invoice and can no longer be edited.')
  }

  const { totals, customer } = await prepareEstimate(db, input)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    await tx.estimateLine.deleteMany({ where: { estimateId: id } })
    await tx.estimate.update({
      where: { id },
      data: {
        customerId: customer.id,
        date: input.date,
        expirationDate: input.expirationDate ?? null,
        subtotal: totals.subtotal.toFixed(2),
        taxRate: money(input.taxRate ?? 0).toFixed(4),
        taxAmount: totals.taxAmount.toFixed(2),
        total: totals.total.toFixed(2),
        notes: nullable(input.notes),
        classId: input.classId ?? null,
        jobId: input.jobId ?? null,
        estimateLines: { create: estimateLineRows(totals) },
      },
    })
    return { id, estimateNumber: existing.estimateNumber }
  })
}

function estimateLineRows(totals: DocumentTotals) {
  return totals.lines.map((line, index) => ({
    itemId: line.itemId ?? null,
    description: nullable(line.description),
    quantity: quantizeQty(line.quantity).toFixed(4),
    rate: money(line.rate).toFixed(2),
    amount: line.amount.toFixed(2),
    isTaxable: line.isTaxable,
    jobId: line.jobId ?? null,
    lineOrder: line.lineOrder ?? index,
  }))
}

async function prepareEstimate(db: TenantClient, input: EstimateInput) {
  assertLines(input.lines, 'estimate')
  assertTaxRate(input.taxRate ?? 0)

  const customer = await db.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, isTaxable: true, terms: true },
  })
  if (!customer) throw new SalesError('Customer not found.', 404)

  const items = await loadItems(db, input.lines)
  const totals = priceDocument(input.lines, input.taxRate ?? 0, {
    customerTaxable: customer.isTaxable,
    itemTaxable: new Map([...items.values()].map((i) => [i.id, i.isTaxable])),
  })
  return { totals, items, customer }
}

export async function setEstimateStatus(
  db: TenantClient,
  id: number,
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING',
) {
  const estimate = await db.estimate.findUnique({ where: { id } })
  if (!estimate) throw new SalesError('Estimate not found.', 404)
  if (estimate.status === EstimateStatus.CONVERTED) {
    throw new SalesError('This estimate has already been converted to an invoice.')
  }
  await db.estimate.update({ where: { id }, data: { status: EstimateStatus[status] } })
  return { id }
}

/** Turn an accepted estimate into an invoice, keeping the link between them. */
export async function convertEstimate(db: TenantClient, id: number) {
  const estimate = await db.estimate.findUnique({
    where: { id },
    include: { estimateLines: { orderBy: { lineOrder: 'asc' } }, customer: true },
  })
  if (!estimate) throw new SalesError('Estimate not found.', 404)
  if (estimate.convertedInvoiceId) throw new SalesError('This estimate has already been converted.')

  const invoice = await createInvoice(db, {
    customerId: estimate.customerId,
    date: estimate.date,
    terms: estimate.customer.terms ?? 'Net 30',
    taxRate: estimate.taxRate.toString(),
    notes: estimate.notes,
    classId: estimate.classId,
    jobId: estimate.jobId,
    lines: estimate.estimateLines.map((line, index) => ({
      itemId: line.itemId,
      description: line.description,
      quantity: line.quantity.toString(),
      rate: line.rate.toString(),
      isTaxable: line.isTaxable,
      jobId: line.jobId,
      lineOrder: line.lineOrder ?? index,
    })),
  })

  await db.estimate.update({
    where: { id },
    data: { status: EstimateStatus.CONVERTED, convertedInvoiceId: invoice.id },
  })

  return invoice
}

// ---------------------------------------------------------------------------
// Payments received
// ---------------------------------------------------------------------------

export type PaymentAllocationInput = { invoiceId: number; amount: Decimal.Value }

export type PaymentInput = {
  customerId: number
  date: Date
  amount: Decimal.Value
  method?: string | null
  checkNumber?: string | null
  reference?: string | null
  depositToAccountId?: number | null
  notes?: string | null
  /** Omit (or leave empty) together with `autoApply` to settle oldest first. */
  allocations?: PaymentAllocationInput[]
  autoApply?: boolean
}

/**
 * Receive a customer payment and apply it.
 *
 * Applications are explicit when the caller supplies them, otherwise the
 * payment walks the customer's open invoices oldest first. Anything left over
 * is an unapplied prepayment: it still relieves accounts receivable, which is
 * why the credit is the full payment amount and not the applied total.
 */
export async function receivePayment(db: TenantClient, input: PaymentInput) {
  await assertPostable(db, input.date)

  const amount = cents(input.amount)
  if (!amount.isPositive()) {
    throw new SalesError('A payment must be positive. Use a credit memo to refund a customer.')
  }

  const customer = await db.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true },
  })
  if (!customer) throw new SalesError('Customer not found.', 404)

  const accounts = await salesAccounts(db)
  const depositTo = input.depositToAccountId ?? accounts.undeposited

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    const requested = input.allocations?.filter((a) => money(a.amount).isPositive()) ?? []
    const allocations =
      requested.length > 0
        ? requested.map((a) => ({ invoiceId: a.invoiceId, amount: cents(a.amount) }))
        : input.autoApply === false
          ? []
          : await oldestFirst(tx, customer.id, amount)

    const applied = cents(sum(allocations.map((a) => a.amount)))
    if (applied.greaterThan(amount)) {
      throw new SalesError('The applied amounts add up to more than the payment.')
    }

    const payment = await tx.payment.create({
      data: {
        customerId: customer.id,
        date: input.date,
        amount: amount.toFixed(2),
        method: nullable(input.method),
        checkNumber: nullable(input.checkNumber),
        reference: nullable(input.reference),
        depositToAccountId: depositTo,
        notes: nullable(input.notes),
      },
    })

    for (const allocation of allocations) {
      const invoice = await tx.invoice.findUnique({ where: { id: allocation.invoiceId } })
      if (!invoice) throw new SalesError(`Invoice ${allocation.invoiceId} not found.`, 404)
      if (invoice.customerId !== customer.id) {
        throw new SalesError(`Invoice ${invoice.invoiceNumber} belongs to another customer.`)
      }
      if (invoice.status === InvoiceStatus.VOID) {
        throw new SalesError(`Invoice ${invoice.invoiceNumber} is voided.`)
      }

      const balance = money(invoice.balanceDue.toString())
      if (allocation.amount.greaterThan(balance)) {
        throw new SalesError(
          `${allocation.amount.toFixed(2)} is more than the ${balance.toFixed(2)} still open on invoice ${invoice.invoiceNumber}.`,
        )
      }

      const paid = cents(money(invoice.amountPaid.toString()).plus(allocation.amount))
      const remaining = cents(balance.minus(allocation.amount))

      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: invoice.id, amount: allocation.amount.toFixed(2) },
      })
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: paid.toFixed(2),
          balanceDue: remaining.toFixed(2),
          status: remaining.isZero() ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
        },
      })
    }

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `Payment from ${customer.name}`,
      reference: nullable(input.reference) ?? nullable(input.checkNumber),
      sourceType: 'payment',
      sourceId: payment.id,
      lines: [
        { accountId: depositTo, debit: amount, description: `Payment from ${customer.name}` },
        {
          accountId: accounts.receivable,
          credit: amount,
          description: `Payment from ${customer.name}`,
        },
      ],
    })

    await tx.payment.update({ where: { id: payment.id }, data: { transactionId: entry.id } })
    return { id: payment.id, applied, unapplied: cents(amount.minus(applied)) }
  })
}

async function oldestFirst(tx: TenantClient, customerId: number, amount: Decimal) {
  const open = await tx.invoice.findMany({
    where: {
      customerId,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.DRAFT] },
      balanceDue: { gt: 0 },
    },
    orderBy: [{ dueDate: 'asc' }, { date: 'asc' }, { id: 'asc' }],
  })

  let left = amount
  const allocations: { invoiceId: number; amount: Decimal }[] = []
  for (const invoice of open) {
    if (!left.isPositive()) break
    const balance = money(invoice.balanceDue.toString())
    const take = cents(Decimal.min(balance, left))
    if (!take.isPositive()) continue
    allocations.push({ invoiceId: invoice.id, amount: take })
    left = cents(left.minus(take))
  }
  return allocations
}

/** Void a payment: reverse the cash entry and re-open every invoice it settled. */
export async function voidPayment(db: TenantClient, id: number) {
  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      paymentAllocations: { include: { invoice: true } },
    },
  })
  if (!payment) throw new SalesError('Payment not found.', 404)
  if (payment.isVoided) throw new SalesError('This payment is already voided.')
  await assertPostable(db, payment.date)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    if (payment.transactionId) {
      await reverseTransaction(tx, payment.transactionId, {
        date: payment.date,
        description: `VOID payment from ${payment.customer.name}`,
      })
    }

    for (const allocation of payment.paymentAllocations) {
      const invoice = allocation.invoice
      if (invoice.status === InvoiceStatus.VOID) continue
      const amount = money(allocation.amount.toString())
      const paid = cents(money(invoice.amountPaid.toString()).minus(amount))
      const balance = cents(money(invoice.balanceDue.toString()).plus(amount))
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: paid.isNegative() ? '0.00' : paid.toFixed(2),
          balanceDue: balance.toFixed(2),
          status: paid.isPositive() ? InvoiceStatus.PARTIAL : InvoiceStatus.SENT,
        },
      })
    }

    await tx.payment.update({ where: { id }, data: { isVoided: true } })
    return { id }
  })
}

// ---------------------------------------------------------------------------
// Credit memos
// ---------------------------------------------------------------------------

export type CreditMemoInput = {
  customerId: number
  date: Date
  originalInvoiceId?: number | null
  taxRate?: Decimal.Value
  notes?: string | null
  classId?: number | null
  jobId?: number | null
  lines: SalesLineInput[]
}

/**
 * Issue a credit memo: income (or bad debt, for a write-off) is debited back,
 * sales tax is debited back, and accounts receivable is credited. Returned
 * inventory comes back on hand and its cost is taken out of cost of sales, so
 * the stock ledger and the general ledger stay in step.
 */
export async function issueCreditMemo(
  db: TenantClient,
  input: CreditMemoInput,
  opts: { isWriteOff?: boolean } = {},
) {
  await assertPostable(db, input.date)
  assertLines(input.lines, 'credit memo')
  assertTaxRate(input.taxRate ?? 0)

  const customer = await db.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, isTaxable: true },
  })
  if (!customer) throw new SalesError('Customer not found.', 404)

  const items = await loadItems(db, input.lines)
  const totals = priceDocument(input.lines, input.taxRate ?? 0, {
    customerTaxable: customer.isTaxable,
    itemTaxable: new Map([...items.values()].map((i) => [i.id, i.isTaxable])),
  })
  if (!totals.total.isPositive()) throw new SalesError('A credit memo must be worth more than zero.')

  const accounts = await salesAccounts(db)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const memoNumber = await nextCreditMemoNumber(tx)

    const memo = await tx.creditMemo.create({
      data: {
        memoNumber,
        customerId: customer.id,
        status: CreditMemoStatus.ISSUED,
        originalInvoiceId: input.originalInvoiceId ?? null,
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
        isWriteOff: opts.isWriteOff ?? false,
        creditMemoLines: {
          create: totals.lines.map((line, index) => ({
            itemId: line.itemId ?? null,
            description: nullable(line.description),
            quantity: quantizeQty(line.quantity).toFixed(4),
            rate: money(line.rate).toFixed(2),
            amount: line.amount.toFixed(2),
            lineOrder: line.lineOrder ?? index,
          })),
        },
      },
    })

    const journal: JournalLine[] = []
    for (const line of totals.lines) {
      if (line.amount.isZero()) continue
      const item = line.itemId != null ? items.get(line.itemId) : undefined
      journal.push({
        accountId: opts.isWriteOff
          ? accounts.badDebt
          : (item?.incomeAccountId ?? accounts.income),
        debit: line.amount,
        description: line.description ?? item?.name ?? `Credit memo ${memoNumber}`,
      })
    }
    if (totals.taxAmount.isPositive()) {
      journal.push({
        accountId: accounts.salesTax,
        debit: totals.taxAmount,
        description: 'Sales tax credit',
      })
    }
    journal.push({
      accountId: accounts.receivable,
      credit: totals.total,
      description: `Credit memo ${memoNumber} — ${customer.name}`,
    })

    const entry = await postJournalEntry(tx, {
      date: input.date,
      description: `Credit memo ${memoNumber} — ${customer.name}`,
      reference: memoNumber,
      sourceType: 'credit_memo',
      sourceId: memo.id,
      classId: input.classId ?? null,
      jobId: input.jobId ?? null,
      lines: journal,
    })
    await tx.creditMemo.update({ where: { id: memo.id }, data: { transactionId: entry.id } })

    // Write-offs never restock: the goods are gone, only the debt is forgiven.
    if (!opts.isWriteOff) await restock(tx, { accounts, items, totals, memoNumber, memoId: memo.id, date: input.date })

    return { id: memo.id, memoNumber, total: totals.total }
  })
}

/** Returned goods back on hand, with the cost taken out of cost of sales. */
async function restock(
  tx: TenantClient,
  args: {
    accounts: SalesAccounts
    items: Map<number, ItemFacts>
    totals: DocumentTotals
    memoNumber: string
    memoId: number
    date: Date
  },
) {
  const byAsset = new Map<number, Decimal>()
  const movementIds: number[] = []
  let totalCost = ZERO

  for (const line of args.totals.lines) {
    if (line.itemId == null) continue
    const item = args.items.get(line.itemId)
    if (!item?.trackInventory) continue
    const movement = await recordReturnIn(tx, {
      itemId: item.id,
      quantity: line.quantity,
      date: args.date,
      reference: `Return on credit memo ${args.memoNumber}`,
      sourceType: 'credit_memo',
      sourceId: args.memoId,
    })
    if (!movement) continue
    movementIds.push(movement.movementId)
    const value = cents(quantizeQty(line.quantity).times(movement.unitCost))
    if (value.isZero()) continue
    const assetId = item.assetAccountId ?? args.accounts.inventory
    byAsset.set(assetId, (byAsset.get(assetId) ?? ZERO).plus(value))
    totalCost = totalCost.plus(value)
  }

  if (!totalCost.isPositive()) return

  const entry = await postJournalEntry(tx, {
    date: args.date,
    description: `Cost of goods returned — credit memo ${args.memoNumber}`,
    reference: args.memoNumber,
    sourceType: 'credit_memo_cogs',
    sourceId: args.memoId,
    lines: [
      ...[...byAsset.entries()].map(([accountId, amount]) => ({
        accountId,
        debit: amount,
        description: `Inventory restocked — ${args.memoNumber}`,
      })),
      {
        accountId: args.accounts.cogs,
        credit: totalCost,
        description: `Cost of goods returned — ${args.memoNumber}`,
      },
    ],
  })

  if (movementIds.length > 0) {
    await tx.inventoryMovement.updateMany({
      where: { id: { in: movementIds } },
      data: { transactionId: entry.id },
    })
  }
}

/**
 * Apply an outstanding credit to an invoice. No entry is posted — accounts
 * receivable was already credited when the memo was issued; this only moves the
 * credit from "unapplied" to "settling invoice X".
 */
export async function applyCreditMemo(
  db: TenantClient,
  memoId: number,
  invoiceId: number,
  requested: Decimal.Value,
) {
  return db.$transaction(async (raw) => {
    const tx = asClient(raw)
    const memo = await tx.creditMemo.findUnique({ where: { id: memoId } })
    if (!memo) throw new SalesError('Credit memo not found.', 404)
    if (memo.status === CreditMemoStatus.VOID) throw new SalesError('This credit memo is voided.')

    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) throw new SalesError('Invoice not found.', 404)
    if (invoice.status === InvoiceStatus.VOID) throw new SalesError('That invoice is voided.')
    if (invoice.customerId !== memo.customerId) {
      throw new SalesError('A credit can only be applied to the same customer’s invoice.')
    }

    const amount = cents(requested)
    if (!amount.isPositive()) throw new SalesError('Enter an amount to apply.')

    const creditLeft = money(memo.balanceRemaining.toString())
    if (amount.greaterThan(creditLeft)) {
      throw new SalesError(`Only ${creditLeft.toFixed(2)} of this credit is still unapplied.`)
    }
    const balance = money(invoice.balanceDue.toString())
    if (amount.greaterThan(balance)) {
      throw new SalesError(`Invoice ${invoice.invoiceNumber} only has ${balance.toFixed(2)} open.`)
    }

    await tx.creditApplication.create({
      data: { creditMemoId: memo.id, invoiceId: invoice.id, amount: amount.toFixed(2) },
    })

    const applied = cents(money(memo.amountApplied.toString()).plus(amount))
    const remaining = cents(creditLeft.minus(amount))
    await tx.creditMemo.update({
      where: { id: memo.id },
      data: {
        amountApplied: applied.toFixed(2),
        balanceRemaining: remaining.toFixed(2),
        status: remaining.isZero() ? CreditMemoStatus.APPLIED : CreditMemoStatus.ISSUED,
      },
    })

    const invoicePaid = cents(money(invoice.amountPaid.toString()).plus(amount))
    const invoiceBalance = cents(balance.minus(amount))
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: invoicePaid.toFixed(2),
        balanceDue: invoiceBalance.toFixed(2),
        status: invoiceBalance.isZero() ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
      },
    })

    return { id: memo.id, applied: amount, invoiceNumber: invoice.invoiceNumber }
  })
}

export async function voidCreditMemo(db: TenantClient, id: number) {
  const memo = await db.creditMemo.findUnique({
    where: { id },
    include: {
      creditApplications: { include: { invoice: true } },
      creditMemoLines: true,
    },
  })
  if (!memo) throw new SalesError('Credit memo not found.', 404)
  if (memo.status === CreditMemoStatus.VOID) throw new SalesError('This credit memo is already voided.')
  await assertPostable(db, memo.date)

  const lines = memo.creditMemoLines.map((line) => ({
    itemId: line.itemId,
    quantity: quantizeQty(line.quantity.toString()),
  }))
  const items = await loadItems(db, lines)

  return db.$transaction(async (raw) => {
    const tx = asClient(raw)

    for (const application of memo.creditApplications) {
      const invoice = application.invoice
      const amount = money(application.amount.toString())
      if (invoice.status !== InvoiceStatus.VOID) {
        const paid = cents(money(invoice.amountPaid.toString()).minus(amount))
        const balance = cents(money(invoice.balanceDue.toString()).plus(amount))
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: paid.isNegative() ? '0.00' : paid.toFixed(2),
            balanceDue: balance.toFixed(2),
            status: paid.isPositive() ? InvoiceStatus.PARTIAL : InvoiceStatus.SENT,
          },
        })
      }
      await tx.creditApplication.delete({ where: { id: application.id } })
    }

    const postings = await tx.transaction.findMany({
      where: {
        sourceId: memo.id,
        sourceType: { in: ['credit_memo', 'credit_memo_cogs'] },
        isVoided: false,
      },
      select: { id: true },
    })
    for (const posting of postings) {
      await reverseTransaction(tx, posting.id, {
        date: memo.date,
        description: `VOID credit memo ${memo.memoNumber}`,
      })
    }

    for (const line of lines) {
      if (line.itemId == null) continue
      const item = items.get(line.itemId)
      if (!item?.trackInventory) continue
      await recordReturnOut(tx, {
        itemId: item.id,
        quantity: line.quantity,
        date: memo.date,
        reference: `VOID credit memo ${memo.memoNumber}`,
        sourceType: 'credit_memo_void',
        sourceId: memo.id,
      })
    }

    await tx.creditMemo.update({
      where: { id: memo.id },
      data: {
        status: CreditMemoStatus.VOID,
        amountApplied: '0.00',
        balanceRemaining: '0.00',
      },
    })

    return { id: memo.id }
  })
}

/**
 * Write an invoice balance off to bad debt: a credit memo that is fully applied
 * the moment it is created.
 */
export async function writeOffInvoice(
  db: TenantClient,
  invoiceId: number,
  args: { date: Date; amount?: Decimal.Value | null; memo?: string | null },
) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new SalesError('Invoice not found.', 404)
  if (invoice.status === InvoiceStatus.VOID) throw new SalesError('This invoice is voided.')

  const balance = money(invoice.balanceDue.toString())
  if (!balance.isPositive()) throw new SalesError('There is nothing left to write off on this invoice.')

  const amount = args.amount == null ? balance : cents(args.amount)
  if (!amount.isPositive() || amount.greaterThan(balance)) {
    throw new SalesError(`Enter an amount between 0.01 and ${balance.toFixed(2)}.`)
  }

  const description = nullable(args.memo) ?? `Write-off: invoice ${invoice.invoiceNumber}`

  const memo = await issueCreditMemo(
    db,
    {
      customerId: invoice.customerId,
      date: args.date,
      originalInvoiceId: invoice.id,
      notes: description,
      classId: invoice.classId,
      jobId: invoice.jobId,
      lines: [{ description, quantity: 1, rate: amount, isTaxable: false }],
    },
    { isWriteOff: true },
  )

  await applyCreditMemo(db, memo.id, invoice.id, amount)
  return memo
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Midnight UTC today — documents are dated, not timestamped. */
export function startOfToday() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Parse a `yyyy-mm-dd` form value into the UTC date the column stores. */
export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  if (!year || !month || !day) throw new SalesError('Enter a valid date.')
  return new Date(Date.UTC(year, month - 1, day))
}

export const toDateInput = (value: Date) => value.toISOString().slice(0, 10)

/** Invoices with an open balance for a customer, oldest first. */
export function openInvoices(db: TenantClient, customerId: number) {
  return db.invoice.findMany({
    where: {
      customerId,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.DRAFT] },
      balanceDue: { gt: 0 },
    },
    orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
    select: {
      id: true,
      invoiceNumber: true,
      date: true,
      dueDate: true,
      total: true,
      balanceDue: true,
    },
  })
}

/** Credit memos with an unapplied balance for a customer. */
export function openCredits(db: TenantClient, customerId: number) {
  return db.creditMemo.findMany({
    where: {
      customerId,
      status: { in: [CreditMemoStatus.ISSUED] },
      balanceRemaining: { gt: 0 },
    },
    orderBy: { date: 'asc' },
    select: { id: true, memoNumber: true, date: true, total: true, balanceRemaining: true },
  })
}

// ---------------------------------------------------------------------------
// Failure messages
// ---------------------------------------------------------------------------

/**
 * Turn an expected failure into something a person can act on. Anything this
 * does not recognise is a bug, not a user error, so it gets a neutral message
 * and the real one stays in the server log — a Prisma error never reaches the UI.
 */
export function describeSalesFailure(error: unknown): string {
  if (error instanceof SalesError) return error.message
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
