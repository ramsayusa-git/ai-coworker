import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { purchasingEditorData } from '../../bills/editor-data'
import { PurchaseOrderEditor } from '../po-editor'
import { newPurchaseOrderDraft } from '../../bills/drafts'

export const metadata = { title: 'New purchase order' }

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { vendors, items } = await purchasingEditorData(db)
  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true'

  const preselected =
    typeof params.vendor === 'string' ? Number.parseInt(params.vendor, 10) : Number.NaN
  const draft = newPurchaseOrderDraft(toDateInput(startOfToday()))
  if (vendors.some((vendor) => vendor.id === preselected)) draft.vendorId = preselected

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="New purchase order"
        description="What you intend to buy. Nothing posts until the goods arrive and you enter the bill."
      />
      <PurchaseOrderEditor
        id={null}
        poNumber={null}
        status="DRAFT"
        initial={draft}
        vendors={vendors}
        items={items}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
