import { getAppContext } from '@/server/context'
import { PageHeader } from '@/components/app/page-header'
import { accountOptions } from '../account-options'
import { ItemForm, emptyItem } from '../item-form'

export const metadata = { title: 'New item' }

export default async function NewItemPage() {
  const { db } = await getAppContext()
  const options = await accountOptions(db)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New item"
        description="A product, a service or a charge you put on invoices."
      />
      <ItemForm
        id={null}
        initial={emptyItem}
        incomeAccounts={options.income}
        expenseAccounts={options.expense}
        assetAccounts={options.asset}
      />
    </div>
  )
}
