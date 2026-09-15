import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { salesEditorData } from '../../invoices/editor-data'
import { EstimateEditor, newEstimateDraft } from '../estimate-editor'

export const metadata = { title: 'New estimate' }

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { customers, items } = await salesEditorData(db)

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true'
  const defaultTaxRate = settings.get('default_tax_rate') || '0'

  const preselected =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : Number.NaN
  const customer = customers.find((candidate) => candidate.id === preselected) ?? null

  const draft = newEstimateDraft(toDateInput(startOfToday()))
  if (customer) draft.customerId = customer.id
  if (taxEnabled) draft.taxRatePercent = defaultTaxRate

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="New estimate"
        description="A quote for work not yet done. Nothing posts until you convert it to an invoice."
      />
      <EstimateEditor
        id={null}
        estimateNumber={null}
        locked={false}
        initial={draft}
        customers={customers}
        items={items}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
