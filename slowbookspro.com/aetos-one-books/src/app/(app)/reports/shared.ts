import type { TenantClient } from '@/lib/tenant-db'
import type { ReportControl } from '@/server/reports/registry'
import { reportDimensions } from '@/server/reports/statements'
import { statementCustomers } from '@/server/reports/sales'
import { reportVendors } from '@/server/reports/purchases'

/**
 * What the report shell needs to fill its filter row, fetched only when a
 * report actually offers that control — an inventory report has no business
 * loading five hundred vendors.
 */

export type ReportOptions = {
  classes: { id: number; name: string }[]
  jobs: { id: number; name: string }[]
  accounts: { id: number; name: string; number: string }[]
  customers: { id: number; name: string }[]
  vendors: { id: number; name: string }[]
}

export async function loadReportOptions(
  db: TenantClient,
  controls: readonly ReportControl[],
): Promise<ReportOptions> {
  const wants = (control: ReportControl) => controls.includes(control)

  const [dimensions, accounts, customers, vendors] = await Promise.all([
    wants('dimensions') ? reportDimensions(db) : Promise.resolve({ classes: [], jobs: [] }),
    wants('account')
      ? db.account.findMany({
          where: { isActive: true },
          select: { id: true, name: true, accountNumber: true },
          orderBy: [{ accountNumber: 'asc' }, { name: 'asc' }],
          take: 500,
        })
      : Promise.resolve([]),
    wants('customer') ? statementCustomers(db) : Promise.resolve([]),
    wants('vendor') ? reportVendors(db) : Promise.resolve([]),
  ])

  return {
    classes: dimensions.classes,
    jobs: dimensions.jobs,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      number: account.accountNumber ?? '',
    })),
    customers,
    vendors,
  }
}

/** The org's own words: a nonprofit reads donors and funds, not customers and classes. */
export function reportTerms(nonprofit: boolean) {
  return nonprofit
    ? {
        customer: 'Donor',
        invoice: 'Pledge',
        netIncome: 'Change in net assets',
        equity: 'Net assets',
        class: 'Fund',
      }
    : {
        customer: 'Customer',
        invoice: 'Invoice',
        netIncome: 'Net income',
        equity: 'Equity',
        class: 'Class',
      }
}
