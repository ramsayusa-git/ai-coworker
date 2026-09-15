import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { purchasingEditorData } from '../editor-data'
import { BillEditor } from '../bill-editor'
import { newBillDraft } from '../drafts'

export const metadata = { title: 'New bill' }

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { vendors, items, accounts } = await purchasingEditorData(db)

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true'

  const preselected =
    typeof params.vendor === 'string' ? Number.parseInt(params.vendor, 10) : Number.NaN
  const vendor = vendors.find((candidate) => candidate.id === preselected) ?? null

  const draft = newBillDraft(toDateInput(startOfToday()), vendor?.terms ?? 'Net 30')
  if (vendor) draft.vendorId = vendor.id

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="New bill"
        description="Saving posts it: the expense — or inventory, for stock — is debited and accounts payable credited, line by line."
      />
      <BillEditor
        id={null}
        billNumber={null}
        status="UNPAID"
        amountPaid={0}
        initial={draft}
        vendors={vendors}
        items={items}
        accounts={accounts}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
