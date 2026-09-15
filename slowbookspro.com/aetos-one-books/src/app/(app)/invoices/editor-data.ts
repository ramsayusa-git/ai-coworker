import 'server-only'
import type { TenantClient } from '@/lib/tenant-db'
import type { LineItemOption } from '@/components/app/line-item-editor'
import type { CustomerOption } from './invoice-editor'

/**
 * Everything the line editor needs to fill itself in: who can be billed and
 * what can be sold. Shared by invoices, estimates and credit memos so the three
 * editors always offer the same pickers.
 */
export async function salesEditorData(db: TenantClient) {
  const [customers, items] = await Promise.all([
    db.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, terms: true, isTaxable: true },
    }),
    db.item.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { income: { select: { name: true } } },
    }),
  ])

  return {
    customers: customers satisfies CustomerOption[],
    items: items.map<LineItemOption>((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      rate: item.rate.toString(),
      isTaxable: item.isTaxable,
      trackInventory: item.trackInventory,
      quantityOnHand: item.trackInventory ? item.quantityOnHand.toString() : null,
      accountName: item.income?.name ?? null,
    })),
  }
}
