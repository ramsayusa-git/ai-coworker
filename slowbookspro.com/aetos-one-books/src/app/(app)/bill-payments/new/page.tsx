import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { openBills, openVendorCredits, purchasingAccounts } from '@/server/purchasing'
import { formatMoney, money, sum } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { paymentAccountOptions } from '../../bills/editor-data'
import { PayBills, type OpenBillRow, type OpenCreditRow, type VendorChoice } from '../pay-bills'

export const metadata = { title: 'Pay bills' }

export default async function PayBillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const currency = settings.get('base_currency') || 'USD'
  const today = startOfToday()

  const requested = typeof params.vendor === 'string' ? Number.parseInt(params.vendor, 10) : Number.NaN
  const vendorId = Number.isFinite(requested) ? requested : null
  const preselectedBillId =
    typeof params.bill === 'string' && Number.isFinite(Number.parseInt(params.bill, 10))
      ? Number.parseInt(params.bill, 10)
      : null

  const [everyOpenBill, accounts, control] = await Promise.all([
    openBills(db),
    paymentAccountOptions(db),
    purchasingAccounts(db),
  ])

  // Only vendors with something outstanding are worth offering.
  const byVendor = new Map<number, VendorChoice>()
  for (const bill of everyOpenBill) {
    const entry =
      byVendor.get(bill.vendorId) ??
      { id: bill.vendorId, name: bill.vendor.name, openCount: 0, openTotal: 0 }
    entry.openCount += 1
    entry.openTotal += Number(bill.balanceDue.toString())
    byVendor.set(bill.vendorId, entry)
  }
  const vendors = [...byVendor.values()].sort((a, b) => a.name.localeCompare(b.name))

  const vendorBills = vendorId ? everyOpenBill.filter((bill) => bill.vendorId === vendorId) : []
  const credits = vendorId ? await openVendorCredits(db, vendorId) : []

  const bills: OpenBillRow[] = vendorBills.map((bill) => {
    const due = bill.dueDate
    return {
      id: bill.id,
      billNumber: bill.billNumber,
      date: bill.date.toISOString().slice(0, 10),
      dueDate: due ? due.toISOString().slice(0, 10) : null,
      ageDays: due ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : null,
      total: formatMoney(bill.total.toString(), currency),
      balanceDue: Number(bill.balanceDue.toString()),
    }
  })

  const creditRows: OpenCreditRow[] = credits.map((credit) => ({
    id: credit.id,
    creditNumber: credit.creditNumber,
    date: credit.date.toISOString().slice(0, 10),
    balanceRemaining: Number(credit.balanceRemaining.toString()),
  }))

  const outstanding = sum(vendorBills.map((bill) => money(bill.balanceDue.toString())))

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Pay bills"
        description={
          vendorId
            ? `${formatMoney(outstanding, currency)} outstanding across ${vendorBills.length} bill${vendorBills.length === 1 ? '' : 's'}.`
            : 'Pick a vendor to see what is open, how old it is and which credits you can put against it.'
        }
      />
      <PayBills
        vendors={vendors}
        vendorId={vendorId}
        bills={bills}
        credits={creditRows}
        accounts={accounts}
        defaultAccountId={control.checking}
        today={toDateInput(today)}
        currency={currency}
        preselectedBillId={preselectedBillId}
      />
    </div>
  )
}
