import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { PageHeader } from '@/components/app/page-header'
import { accountOptions } from '../../account-options'
import { ItemForm, type ItemDraft } from '../../item-form'

export const metadata = { title: 'Edit item' }

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [item, options] = await Promise.all([
    db.item.findUnique({ where: { id } }),
    accountOptions(db),
  ])
  if (!item) notFound()

  const initial: ItemDraft = {
    name: item.name,
    itemType: item.itemType,
    description: item.description ?? '',
    rate: item.rate.toString(),
    cost: item.cost.toString(),
    incomeAccountId: item.incomeAccountId,
    expenseAccountId: item.expenseAccountId,
    assetAccountId: item.assetAccountId,
    isTaxable: item.isTaxable,
    trackInventory: item.trackInventory,
    reorderPoint: item.reorderPoint.toString(),
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={item.name} description="Edit this item." />
      <ItemForm
        id={item.id}
        initial={initial}
        incomeAccounts={options.income}
        expenseAccounts={options.expense}
        assetAccounts={options.asset}
        onHand={item.trackInventory ? item.quantityOnHand.toString() : undefined}
      />
    </div>
  )
}
