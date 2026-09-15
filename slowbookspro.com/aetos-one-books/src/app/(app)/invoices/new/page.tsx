import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { salesEditorData } from '../editor-data'
import { InvoiceEditor, newInvoiceDraft } from '../invoice-editor'

export const metadata = { title: 'New invoice' }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings, features } = await getAppContext()
  const params = await searchParams
  const { customers, items } = await salesEditorData(db)

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true'
  const defaultTaxRate = settings.get('default_tax_rate') || '0'
  const label = features.nonprofit ? 'Pledge' : 'Invoice'

  const preselected =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : Number.NaN
  const customer = customers.find((candidate) => candidate.id === preselected) ?? null

  const draft = newInvoiceDraft(toDateInput(startOfToday()), customer?.terms ?? 'Net 30')
  if (customer) draft.customerId = customer.id
  if (taxEnabled) draft.taxRatePercent = defaultTaxRate

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`New ${label.toLowerCase()}`}
        description="Saving posts it: accounts receivable is debited and income credited, line by line."
      />
      <InvoiceEditor
        id={null}
        invoiceNumber={null}
        status="DRAFT"
        amountPaid={0}
        initial={draft}
        customers={customers}
        items={items}
        currency={currency}
        taxEnabled={taxEnabled}
        label={label}
      />
    </div>
  )
}
