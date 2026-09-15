import { getAppContext } from '@/server/context'
import { PageHeader } from '@/components/app/page-header'
import { expenseAccountOptions } from '../../bills/editor-data'
import { emptyVendor, VendorForm } from '../vendor-form'

export const metadata = { title: 'New vendor' }

export default async function NewVendorPage() {
  const { db } = await getAppContext()
  const expenseAccounts = await expenseAccountOptions(db)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New vendor"
        description="A vendor is who a bill is owed to. Nothing posts until you enter a bill against them."
      />
      <VendorForm id={null} initial={emptyVendor} expenseAccounts={expenseAccounts} />
    </div>
  )
}
