import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { PageHeader } from '@/components/app/page-header'
import { purchasingEditorData } from '../../bills/editor-data'
import { VendorCreditEditor, type BillChoice } from '../credit-editor'
import { newVendorCreditDraft } from '../../bills/drafts'

export const metadata = { title: 'New vendor credit' }

export default async function NewVendorCreditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const [{ vendors, items, accounts }, recentBills] = await Promise.all([
    purchasingEditorData(db),
    db.bill.findMany({
      where: { status: { not: 'VOID' } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 300,
      select: { id: true, billNumber: true, vendorId: true, date: true },
    }),
  ])

  const currency = settings.get('base_currency') || 'USD'
  const taxEnabled = settings.get('sales_tax_enabled') === 'true'

  const bills: BillChoice[] = recentBills.map((bill) => ({
    id: bill.id,
    vendorId: bill.vendorId,
    label: `${bill.billNumber} · ${bill.date.toISOString().slice(0, 10)}`,
  }))

  const draft = newVendorCreditDraft(toDateInput(startOfToday()))
  const preselected =
    typeof params.vendor === 'string' ? Number.parseInt(params.vendor, 10) : Number.NaN
  if (vendors.some((vendor) => vendor.id === preselected)) draft.vendorId = preselected
  const preselectedBill =
    typeof params.bill === 'string' ? Number.parseInt(params.bill, 10) : Number.NaN
  if (bills.some((bill) => bill.id === preselectedBill)) draft.originalBillId = preselectedBill

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="New vendor credit"
        description="Saving posts it: accounts payable is debited and the expense — or inventory, for a return — credited back."
      />
      <VendorCreditEditor
        initial={draft}
        vendors={vendors}
        items={items}
        accounts={accounts}
        bills={bills}
        currency={currency}
        taxEnabled={taxEnabled}
      />
    </div>
  )
}
