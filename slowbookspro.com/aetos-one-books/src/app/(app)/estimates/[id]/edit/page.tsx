import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { salesEditorData } from '../../../invoices/editor-data'
import { EstimateEditor, type EstimateDraft } from '../../estimate-editor'

export const metadata = { title: 'Edit estimate' }

export default async function EditEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [estimate, editorData] = await Promise.all([
    db.estimate.findUnique({
      where: { id },
      include: { estimateLines: { orderBy: { lineOrder: 'asc' } } },
    }),
    salesEditorData(db),
  ])
  if (!estimate) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true' || !estimate.taxRate.equals(0)

  const initial: EstimateDraft = {
    customerId: estimate.customerId,
    date: toDateInput(estimate.date),
    expirationDate: estimate.expirationDate ? toDateInput(estimate.expirationDate) : '',
    // Stored as a fraction; the editor works in percent.
    taxRatePercent: (Number(estimate.taxRate.toString()) * 100).toFixed(4).replace(/\.?0+$/, ''),
    notes: estimate.notes ?? '',
    lines: estimate.estimateLines.map((line) => ({
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
        title={`Edit estimate ${estimate.estimateNumber}`}
        description={
          estimate.status === 'CONVERTED'
            ? 'This estimate has already become an invoice, so it is read-only. Edit the invoice instead.'
            : 'Changing an estimate posts nothing — the ledger only hears about it at conversion.'
        }
      />
      <EstimateEditor
        id={estimate.id}
        estimateNumber={estimate.estimateNumber}
        locked={estimate.status === 'CONVERTED'}
        initial={initial}
        customers={editorData.customers}
        items={editorData.items}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
