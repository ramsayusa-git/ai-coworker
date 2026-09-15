import { notFound } from 'next/navigation'
import { getAppContext } from '@/server/context'
import { toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { purchasingEditorData } from '../../editor-data'
import { BillEditor, type BillDraft } from '../../bill-editor'

export const metadata = { title: 'Edit bill' }

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const [bill, editorData] = await Promise.all([
    db.bill.findUnique({ where: { id }, include: { billLines: { orderBy: { lineOrder: 'asc' } } } }),
    purchasingEditorData(db),
  ])
  if (!bill) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true' || !bill.taxRate.equals(0)

  const initial: BillDraft = {
    vendorId: bill.vendorId,
    billNumber: bill.billNumber,
    date: toDateInput(bill.date),
    dueDate: bill.dueDate ? toDateInput(bill.dueDate) : '',
    terms: bill.terms ?? 'Net 30',
    refNumber: bill.refNumber ?? '',
    // Stored as a fraction; the editor works in percent.
    taxRatePercent: (Number(bill.taxRate.toString()) * 100).toFixed(4).replace(/\.?0+$/, '') || '0',
    notes: bill.notes ?? '',
    lines: bill.billLines.map((line) => ({
      key: `line-${line.id}`,
      itemId: line.itemId,
      accountId: line.accountId,
      description: line.description ?? '',
      quantity: line.quantity.toString(),
      rate: line.rate.toString(),
    })),
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Edit bill ${bill.billNumber}`}
        description="The original entry is reversed and a new one posted, so the journal keeps both. Stock received by the old version goes back out first."
      />
      <BillEditor
        id={bill.id}
        billNumber={bill.billNumber}
        status={bill.status}
        amountPaid={Number(bill.amountPaid.toString())}
        initial={initial}
        vendors={editorData.vendors}
        items={editorData.items}
        accounts={editorData.accounts}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
