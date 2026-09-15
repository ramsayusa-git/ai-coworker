import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { salesEditorData } from '../../invoices/editor-data'
import { CreditMemoEditor, newCreditMemoDraft, type CreditableInvoice } from '../credit-memo-editor'

export const metadata = { title: 'New credit memo' }

export default async function NewCreditMemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true'
  const defaultTaxRate = settings.get('default_tax_rate') || '0'

  const [{ customers, items }, recentInvoices] = await Promise.all([
    salesEditorData(db),
    db.invoice.findMany({
      where: { status: { not: 'VOID' } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 300,
      select: { id: true, invoiceNumber: true, customerId: true, total: true },
    }),
  ])

  const invoices: CreditableInvoice[] = recentInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    total: invoice.total.toString(),
  }))

  const customerParam =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : Number.NaN
  const invoiceParam =
    typeof params.invoice === 'string' ? Number.parseInt(params.invoice, 10) : Number.NaN

  const draft = newCreditMemoDraft(toDateInput(startOfToday()))
  const preselectedInvoice = invoices.find((invoice) => invoice.id === invoiceParam) ?? null
  if (preselectedInvoice) {
    draft.customerId = preselectedInvoice.customerId
    draft.originalInvoiceId = preselectedInvoice.id
  } else if (Number.isFinite(customerParam)) {
    draft.customerId = customerParam
  }
  if (taxEnabled) draft.taxRatePercent = defaultTaxRate

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="New credit memo"
        description="Giving value back: income is debited, sales tax reversed and accounts receivable credited."
      />
      <CreditMemoEditor
        initial={draft}
        customers={customers}
        items={items}
        invoices={invoices}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
