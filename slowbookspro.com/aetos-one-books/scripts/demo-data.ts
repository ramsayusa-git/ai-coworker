/**
 * Demo data for a freshly provisioned org: customers, items, invoices,
 * payments and a few expenses, all posted through the real services so the
 * ledger, the reports and the dashboard are all consistent.
 *
 *   npm run demo -- --org demo
 */
import 'dotenv/config'
import { controlDb } from '../src/lib/control-db'
import { tenantDb } from '../src/lib/tenant-db'
import {
  createCustomer,
  createInvoice,
  createItem,
  receivePayment,
  sendInvoice,
} from '../src/server/sales'
import { postJournalEntry } from '../src/server/ledger'
import { controlAccountId, CONTROL_ACCOUNTS } from '../src/server/seed-tenant'

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const day = (offset: number) => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

async function main() {
  const slug = arg('org', 'demo')!
  const org = await controlDb.org.findUniqueOrThrow({ where: { slug } })
  const db = await tenantDb(org.id)

  if ((await db.customer.count()) > 0) {
    console.log('Org already has data — nothing to do.')
    process.exit(0)
  }

  const income = await controlAccountId(db, CONTROL_ACCOUNTS.SALES)
  const service = await controlAccountId(db, CONTROL_ACCOUNTS.SERVICE_INCOME)
  const inventoryAsset = await controlAccountId(db, CONTROL_ACCOUNTS.INVENTORY)
  const cogs = await controlAccountId(db, CONTROL_ACCOUNTS.COGS)
  const checking = await controlAccountId(db, CONTROL_ACCOUNTS.CHECKING)
  const equity = await controlAccountId(db, CONTROL_ACCOUNTS.OWNER_EQUITY)
  const rent = await controlAccountId(db, CONTROL_ACCOUNTS.RENT)
  const utilities = await controlAccountId(db, CONTROL_ACCOUNTS.UTILITIES)
  const software = (await db.account.findFirst({ where: { accountNumber: '6350' } }))!.id

  // Opening capital, so the bank account is not born overdrawn.
  await postJournalEntry(db, {
    date: day(-180),
    description: 'Opening capital',
    sourceType: 'opening_balance',
    lines: [
      { accountId: checking, debit: 45000 },
      { accountId: equity, credit: 45000 },
    ],
  })

  const customers = [
    { name: 'Northwind Traders', email: 'ap@northwind.example', terms: 'Net 30' },
    { name: 'Contoso Manufacturing', email: 'accounts@contoso.example', terms: 'Net 15' },
    { name: 'Fabrikam Residential', email: 'billing@fabrikam.example', terms: 'Net 30' },
    { name: 'Tailspin Logistics', email: 'finance@tailspin.example', terms: 'Net 45' },
    { name: 'Wide World Importers', email: 'ap@wideworld.example', terms: 'Due on receipt' },
  ]
  const madeCustomers: Awaited<ReturnType<typeof createCustomer>>[] = []
  for (const c of customers) {
    madeCustomers.push(await createCustomer(db, { ...c, isTaxable: true }))
  }

  const items = [
    { name: 'Control panel assembly', itemType: 'PRODUCT' as const, rate: 2450, cost: 1580, trackInventory: true, incomeAccountId: income, assetAccountId: inventoryAsset, expenseAccountId: cogs },
    { name: 'PLC gateway module', itemType: 'PRODUCT' as const, rate: 890, cost: 540, trackInventory: true, incomeAccountId: income, assetAccountId: inventoryAsset, expenseAccountId: cogs },
    { name: 'Sensor kit', itemType: 'PRODUCT' as const, rate: 310, cost: 175, trackInventory: true, incomeAccountId: income, assetAccountId: inventoryAsset, expenseAccountId: cogs },
    { name: 'Commissioning', itemType: 'SERVICE' as const, rate: 165, incomeAccountId: service },
    { name: 'Support retainer', itemType: 'SERVICE' as const, rate: 950, incomeAccountId: service },
  ]
  const madeItems: Awaited<ReturnType<typeof createItem>>[] = []
  for (const i of items) madeItems.push(await createItem(db, i))

  // Stock the inventory items — a purchase, paid from the bank.
  const { recordMovement } = await import('../src/server/inventory')
  for (const [index, item] of madeItems.entries()) {
    if (!item.trackInventory) continue
    const qty = [12, 30, 80][index] ?? 10
    const unitCost = Number(item.cost ?? 0)
    await db.$transaction(async (tx) => {
      const entry = await postJournalEntry(tx as never, {
        date: day(-150),
        description: `Opening stock — ${item.name}`,
        sourceType: 'inventory_adjustment',
        lines: [
          { accountId: inventoryAsset, debit: qty * unitCost },
          { accountId: checking, credit: qty * unitCost },
        ],
      })
      await recordMovement(tx as never, {
        itemId: item.id,
        type: 'PURCHASE',
        quantity: qty,
        unitCost,
        transactionId: entry.id,
        reference: 'Opening stock',
      })
    })
  }

  // Invoices spread over the last five months, most paid, a few still open.
  const plan = [
    { customer: 0, days: -132, lines: [[0, 2], [3, 8]] as [number, number][], paid: true },
    { customer: 1, days: -118, lines: [[1, 4], [3, 12]] as [number, number][], paid: true },
    { customer: 2, days: -96, lines: [[2, 15]] as [number, number][], paid: true },
    { customer: 3, days: -80, lines: [[0, 1], [4, 1]] as [number, number][], paid: true },
    { customer: 0, days: -64, lines: [[1, 6], [3, 20]] as [number, number][], paid: true },
    { customer: 4, days: -52, lines: [[2, 24], [3, 6]] as [number, number][], paid: true },
    { customer: 1, days: -38, lines: [[0, 3]] as [number, number][], paid: true },
    { customer: 2, days: -26, lines: [[4, 1], [3, 10]] as [number, number][], paid: false },
    { customer: 3, days: -14, lines: [[1, 2], [2, 8]] as [number, number][], paid: false },
    { customer: 0, days: -6, lines: [[0, 1], [3, 16]] as [number, number][], paid: false },
    { customer: 4, days: -2, lines: [[4, 1]] as [number, number][], paid: false },
  ]

  for (const row of plan) {
    const customer = madeCustomers[row.customer]!
    const invoice = await createInvoice(db, {
      customerId: customer.id,
      date: day(row.days),
      taxRate: 0,
      lines: row.lines.map(([itemIndex, qty], order) => {
        const item = madeItems[itemIndex]!
        return {
          itemId: item.id,
          description: item.name,
          quantity: qty,
          rate: Number(item.rate ?? 0),
          isTaxable: false,
          lineOrder: order,
        }
      }),
    })
    await sendInvoice(db, invoice.id)
    if (row.paid) {
      const posted = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
      const total = posted.total.toString()
      await receivePayment(db, {
        customerId: customer.id,
        date: day(row.days + 21),
        amount: total,
        method: 'check',
        depositToAccountId: checking,
        allocations: [{ invoiceId: invoice.id, amount: total }],
      })
    }
  }

  // Running costs, so the P&L is not all revenue.
  for (let m = 5; m >= 0; m -= 1) {
    const date = day(-m * 30 - 3)
    await postJournalEntry(db, {
      date,
      description: 'Monthly rent',
      sourceType: 'expense',
      lines: [
        { accountId: rent, debit: 2400 },
        { accountId: checking, credit: 2400 },
      ],
    })
    await postJournalEntry(db, {
      date,
      description: 'Utilities',
      sourceType: 'expense',
      lines: [
        { accountId: utilities, debit: 310 + m * 12 },
        { accountId: checking, credit: 310 + m * 12 },
      ],
    })
    await postJournalEntry(db, {
      date,
      description: 'Software subscriptions',
      sourceType: 'expense',
      lines: [
        { accountId: software, debit: 289 },
        { accountId: checking, credit: 289 },
      ],
    })
  }

  const counts = {
    customers: await db.customer.count(),
    items: await db.item.count(),
    invoices: await db.invoice.count(),
    payments: await db.payment.count(),
    transactions: await db.transaction.count(),
  }
  console.log('Demo data ready:', counts)
  await controlDb.$disconnect()
  process.exit(0)
}

main().catch((error) => {
  console.error('Demo data failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
