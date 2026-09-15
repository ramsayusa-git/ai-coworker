import 'server-only'
import type { TenantClient } from '@/lib/tenant-db'
import type { AccountOption, PurchaseItemOption } from '@/components/app/purchase-line-editor'

/**
 * Everything a purchase document's editor needs to fill itself in: who can be
 * bought from, what can be bought, and where the cost may land. Shared by
 * bills, purchase orders and vendor credits so the three editors always offer
 * the same pickers.
 */

export type VendorOption = {
  id: number
  name: string
  email: string | null
  terms: string | null
  defaultExpenseAccountId: number | null
}

/** Accounts a cost may be posted to: expenses, cost of sales, and assets you capitalise. */
export function expenseAccountOptions(db: TenantClient): Promise<AccountOption[]> {
  return db.account.findMany({
    where: { isActive: true, accountType: { in: ['EXPENSE', 'COGS', 'ASSET'] } },
    orderBy: { accountNumber: 'asc' },
    select: { id: true, name: true, accountNumber: true },
  })
}

/** Bank, cash and credit-card accounts money can come out of. */
export function paymentAccountOptions(db: TenantClient): Promise<AccountOption[]> {
  return db.account.findMany({
    where: { isActive: true, accountType: { in: ['ASSET', 'LIABILITY'] } },
    orderBy: { accountNumber: 'asc' },
    select: { id: true, name: true, accountNumber: true },
  })
}

export async function purchasingEditorData(db: TenantClient) {
  const [vendors, items, accounts] = await Promise.all([
    db.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, terms: true, defaultExpenseAccountId: true },
    }),
    db.item.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    expenseAccountOptions(db),
  ])

  return {
    vendors: vendors satisfies VendorOption[],
    items: items.map<PurchaseItemOption>((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      // The cost side of an item is what a purchase line starts from — never
      // the sales rate.
      cost: item.cost.toString(),
      trackInventory: item.trackInventory,
      quantityOnHand: item.trackInventory ? item.quantityOnHand.toString() : null,
      expenseAccountId: item.expenseAccountId,
    })),
    accounts,
  }
}
