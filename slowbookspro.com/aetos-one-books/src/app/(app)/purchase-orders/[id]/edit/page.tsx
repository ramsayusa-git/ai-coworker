import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { purchasingEditorData } from '../../../bills/editor-data'
import { PurchaseOrderEditor, type PurchaseOrderDraft } from '../../po-editor'

export const metadata = { title: 'Edit purchase order' }

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [po, editorData] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: { purchaseOrderLines: { orderBy: { lineOrder: 'asc' } } },
    }),
    purchasingEditorData(db),
  ])
  if (!po) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true' || !po.taxRate.equals(0)

  const initial: PurchaseOrderDraft = {
    vendorId: po.vendorId,
    date: toDateInput(po.date),
    expectedDate: po.expectedDate ? toDateInput(po.expectedDate) : '',
    shipTo: po.shipTo ?? '',
    taxRatePercent: (Number(po.taxRate.toString()) * 100).toFixed(4).replace(/\.?0+$/, '') || '0',
    notes: po.notes ?? '',
    lines: po.purchaseOrderLines.map((line) => ({
      key: `line-${line.id}`,
      itemId: line.itemId,
      accountId: null,
      description: line.description ?? '',
      quantity: line.quantity.toString(),
      rate: line.rate.toString(),
    })),
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={`Edit ${po.poNumber}`} description="Changing an order changes nothing in the ledger." />
      <PurchaseOrderEditor
        id={po.id}
        poNumber={po.poNumber}
        status={po.status}
        initial={initial}
        vendors={editorData.vendors}
        items={editorData.items}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
