import 'server-only'
import type { TenantClient } from '@/lib/tenant-db'
import type { EntityOption } from '@/components/app/entity-picker'

/** Accounts an item may post to, grouped by the role they play. */
export async function accountOptions(db: TenantClient) {
  const accounts = await db.account.findMany({
    where: { isActive: true },
    orderBy: { accountNumber: 'asc' },
    select: { id: true, name: true, accountNumber: true, accountType: true },
  })

  const toOption = (account: (typeof accounts)[number]): EntityOption => ({
    id: account.id,
    label: account.name,
    hint: account.accountNumber ?? undefined,
    keywords: account.accountType,
  })

  return {
    income: accounts.filter((a) => a.accountType === 'INCOME').map(toOption),
    expense: accounts.filter((a) => a.accountType === 'COGS' || a.accountType === 'EXPENSE').map(toOption),
    asset: accounts.filter((a) => a.accountType === 'ASSET').map(toOption),
  }
}
