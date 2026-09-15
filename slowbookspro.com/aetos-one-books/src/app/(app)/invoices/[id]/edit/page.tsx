import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { salesEditorData } from '../../editor-data'
import { InvoiceEditor, type InvoiceDraft } from '../../invoice-editor'

export const metadata = { title: 'Edit invoice' }

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings, features } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [invoice, editorData] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: { invoiceLines: { orderBy: { lineOrder: 'asc' } } },
    }),
    salesEditorData(db),
  ])
  if (!invoice) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true' || !invoice.taxRate.equals(0)
  const label = features.nonprofit ? 'Pledge' : 'Invoice'

  const initial: InvoiceDraft = {
    customerId: invoice.customerId,
    date: toDateInput(invoice.date),
    dueDate: invoice.dueDate ? toDateInput(invoice.dueDate) : '',
    terms: invoice.terms ?? 'Net 30',
    poNumber: invoice.poNumber ?? '',
    // Stored as a fraction; the editor works in percent.
    taxRatePercent: (Number(invoice.taxRate.toString()) * 100).toFixed(4).replace(/\.?0+$/, ''),
    notes: invoice.notes ?? '',
    lines: invoice.invoiceLines.map((line) => ({
      key: `line-${line.id}`,
      itemId: line.itemId,
      description: line.description ?? '',
      quantity: line.quantity.toString(),
      rate: line.rate.toString(),
      isTaxable: line.isTaxable,
    })),
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Edit ${label.toLowerCase()} ${invoice.invoiceNumber}`}
        description="The original entry is reversed and a new one posted, so the journal keeps both."
      />
      <InvoiceEditor
        id={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        status={invoice.status}
        amountPaid={Number(invoice.amountPaid.toString())}
        initial={initial}
        customers={editorData.customers}
        items={editorData.items}
        currency={currency}
        taxEnabled={taxEnabled}
        label={label}
      />
    </div>
  )
}
