import 'server-only'
import type { TenantClient } from '@/lib/tenant-db'
import type { AccountType } from '@/generated/tenant/client'

/**
 * A freshly provisioned environment gets a working chart of accounts, the
 * control accounts every posting routine depends on, and the default settings.
 * Seeding is idempotent: re-running it adds what is missing and touches
 * nothing else.
 */

type SeedAccount = {
  number: string
  name: string
  type: AccountType
  bankKind?: 'bank' | 'credit_card'
  description?: string
}

/** Control accounts — code looks these up by number, never by name. */
export const CONTROL_ACCOUNTS = {
  CHECKING: '1000',
  UNDEPOSITED_FUNDS: '1050',
  ACCOUNTS_RECEIVABLE: '1200',
  INVENTORY: '1300',
  PREPAID: '1400',
  FIXED_ASSETS: '1500',
  ACCUM_DEPRECIATION: '1590',
  ACCOUNTS_PAYABLE: '2000',
  CREDIT_CARD: '2100',
  SALES_TAX_PAYABLE: '2200',
  PAYROLL_LIABILITIES: '2300',
  OPENING_BALANCE_EQUITY: '3000',
  RETAINED_EARNINGS: '3300',
  OWNER_EQUITY: '3400',
  UNRESTRICTED_NET_ASSETS: '3900',
  SALES: '4000',
  SERVICE_INCOME: '4100',
  SHIPPING_INCOME: '4300',
  OTHER_INCOME: '4400',
  DISCOUNTS: '4500',
  LATE_FEES: '4800',
  COGS: '5000',
  INVENTORY_ADJUSTMENT: '5100',
  PAYROLL_WAGES: '6000',
  PAYROLL_TAXES: '6010',
  PAYROLL_BENEFITS: '6020',
  RENT: '6100',
  UTILITIES: '6200',
  OFFICE: '6300',
  INSURANCE: '6400',
  PROFESSIONAL_FEES: '6500',
  DEPRECIATION: '6600',
  BANK_FEES: '6700',
  MEALS: '6800',
  TRAVEL: '6850',
  BAD_DEBT: '6960',
  UNCATEGORIZED_EXPENSE: '6999',
  FX_GAIN_LOSS: '7000',
} as const

const CHART: SeedAccount[] = [
  { number: '1000', name: 'Business Checking', type: 'ASSET', bankKind: 'bank' },
  { number: '1010', name: 'Business Savings', type: 'ASSET', bankKind: 'bank' },
  { number: '1050', name: 'Undeposited Funds', type: 'ASSET', description: 'Payments received but not yet deposited' },
  { number: '1100', name: 'Petty Cash', type: 'ASSET' },
  { number: '1200', name: 'Accounts Receivable', type: 'ASSET', description: 'Control account — posted by invoices and payments' },
  { number: '1300', name: 'Inventory Asset', type: 'ASSET', description: 'Perpetual, weighted-average' },
  { number: '1400', name: 'Prepaid Expenses', type: 'ASSET' },
  { number: '1500', name: 'Fixed Assets', type: 'ASSET' },
  { number: '1590', name: 'Accumulated Depreciation', type: 'ASSET', description: 'Contra-asset' },

  { number: '2000', name: 'Accounts Payable', type: 'LIABILITY', description: 'Control account — posted by bills and bill payments' },
  { number: '2100', name: 'Credit Card', type: 'LIABILITY', bankKind: 'credit_card' },
  { number: '2200', name: 'Sales Tax Payable', type: 'LIABILITY' },
  { number: '2300', name: 'Payroll Liabilities', type: 'LIABILITY' },
  { number: '2310', name: 'Federal Withholding Payable', type: 'LIABILITY' },
  { number: '2320', name: 'FICA Payable', type: 'LIABILITY' },
  { number: '2330', name: 'State Withholding Payable', type: 'LIABILITY' },
  { number: '2340', name: 'Unemployment Tax Payable', type: 'LIABILITY' },
  { number: '2400', name: 'Customer Deposits', type: 'LIABILITY' },
  { number: '2700', name: 'Long-Term Debt', type: 'LIABILITY' },

  { number: '3000', name: 'Opening Balance Equity', type: 'EQUITY' },
  { number: '3300', name: 'Retained Earnings', type: 'EQUITY' },
  { number: '3400', name: "Owner's Equity", type: 'EQUITY' },
  { number: '3500', name: "Owner's Draw", type: 'EQUITY' },
  { number: '3900', name: 'Unrestricted Net Assets', type: 'EQUITY', description: 'Nonprofit' },

  { number: '4000', name: 'Sales', type: 'INCOME' },
  { number: '4100', name: 'Service Income', type: 'INCOME' },
  { number: '4300', name: 'Shipping Income', type: 'INCOME' },
  { number: '4400', name: 'Other Income', type: 'INCOME' },
  { number: '4500', name: 'Discounts Given', type: 'INCOME', description: 'Contra-income' },
  { number: '4800', name: 'Late Fee Income', type: 'INCOME' },

  { number: '5000', name: 'Cost of Goods Sold', type: 'COGS' },
  { number: '5100', name: 'Inventory Adjustment', type: 'COGS' },
  { number: '5200', name: 'Subcontracted Labor', type: 'COGS' },
  { number: '5300', name: 'Materials', type: 'COGS' },
  { number: '5400', name: 'Freight In', type: 'COGS' },

  { number: '6000', name: 'Wages', type: 'EXPENSE' },
  { number: '6010', name: 'Payroll Taxes', type: 'EXPENSE' },
  { number: '6020', name: 'Employee Benefits', type: 'EXPENSE' },
  { number: '6100', name: 'Rent', type: 'EXPENSE' },
  { number: '6200', name: 'Utilities', type: 'EXPENSE' },
  { number: '6300', name: 'Office Supplies', type: 'EXPENSE' },
  { number: '6350', name: 'Software and Subscriptions', type: 'EXPENSE' },
  { number: '6400', name: 'Insurance', type: 'EXPENSE' },
  { number: '6500', name: 'Professional Fees', type: 'EXPENSE' },
  { number: '6600', name: 'Depreciation Expense', type: 'EXPENSE' },
  { number: '6700', name: 'Bank Service Charges', type: 'EXPENSE' },
  { number: '6750', name: 'Merchant Processing Fees', type: 'EXPENSE' },
  { number: '6800', name: 'Meals', type: 'EXPENSE' },
  { number: '6850', name: 'Travel', type: 'EXPENSE' },
  { number: '6900', name: 'Repairs and Maintenance', type: 'EXPENSE' },
  { number: '6910', name: 'Advertising and Marketing', type: 'EXPENSE' },
  { number: '6920', name: 'Telephone and Internet', type: 'EXPENSE' },
  { number: '6930', name: 'Vehicle Expense', type: 'EXPENSE' },
  { number: '6940', name: 'Dues and Subscriptions', type: 'EXPENSE' },
  { number: '6960', name: 'Bad Debt Expense', type: 'EXPENSE' },
  { number: '6999', name: 'Uncategorized Expense', type: 'EXPENSE', description: 'Where unmatched bank lines land until they are categorised' },
  { number: '7000', name: 'Exchange Gain or Loss', type: 'EXPENSE', description: 'Realised FX difference on settlement' },
]

export const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: '',
  company_email: '',
  company_phone: '',
  company_address: '',
  company_city: '',
  company_state: '',
  company_zip: '',
  company_country: 'US',
  base_currency: 'USD',
  fiscal_year_start_month: '1',
  date_format: 'MM/DD/YYYY',

  invoice_prefix: 'INV-',
  invoice_next_number: '1000',
  estimate_prefix: 'EST-',
  estimate_next_number: '1000',
  bill_prefix: 'BILL-',
  po_prefix: 'PO-',
  credit_memo_prefix: 'CM-',
  journal_prefix: 'JE-',
  default_payment_terms: 'net_30',
  default_invoice_memo: '',
  late_fee_percent: '0',

  sales_tax_enabled: 'false',
  default_tax_rate: '0',
  inventory_enabled: 'true',
  inventory_costing: 'weighted_average',
  negative_inventory_allowed: 'true',

  payroll_enabled: 'false',
  payroll_state: '',
  nonprofit_mode: 'false',
  multicurrency_enabled: 'false',

  closing_date: '',
  closing_date_locked: 'true',

  ai_enabled: 'false',
  ai_provider: '',

  portal_enabled: 'true',
  portal_allow_online_payment: 'false',
}

export async function seedTenant(
  db: TenantClient,
  opts: { companyName?: string; baseCurrency?: string; nonprofit?: boolean } = {},
) {
  const existing = await db.account.findMany({ select: { accountNumber: true } })
  const have = new Set(existing.map((a) => a.accountNumber))

  const missing = CHART.filter((a) => !have.has(a.number))
  if (missing.length) {
    await db.account.createMany({
      data: missing.map((a) => ({
        accountNumber: a.number,
        name: a.name,
        accountType: a.type,
        bankKind: a.bankKind ?? null,
        description: a.description ?? null,
        isSystem: true,
        isActive: true,
      })),
    })
  }

  const settings = {
    ...DEFAULT_SETTINGS,
    company_name: opts.companyName ?? DEFAULT_SETTINGS.company_name,
    base_currency: opts.baseCurrency ?? DEFAULT_SETTINGS.base_currency,
    nonprofit_mode: opts.nonprofit ? 'true' : 'false',
  }

  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value } })
  }

  return { accounts: missing.length, settings: Object.keys(settings).length }
}

/** Look up a control account id by its number; throws rather than guessing. */
export async function controlAccountId(db: TenantClient, number: string): Promise<number> {
  const account = await db.account.findFirst({ where: { accountNumber: number } })
  if (!account) {
    throw Object.assign(
      new Error(`Control account ${number} is missing from the chart of accounts`),
      { status: 409 },
    )
  }
  return account.id
}
