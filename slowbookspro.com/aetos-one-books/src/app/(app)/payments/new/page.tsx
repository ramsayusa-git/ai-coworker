import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { CONTROL_ACCOUNTS } from '@/server/seed-tenant'
import { PageHeader } from '@/components/app/page-header'
import { PaymentForm, type DepositAccountOption } from '../payment-form'

export const metadata = { title: 'Receive payment' }

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const currency = settings.get('base_currency') || 'USD'

  const [customers, accounts] = await Promise.all([
    db.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
    db.account.findMany({
      where: {
        isActive: true,
        OR: [{ bankKind: 'bank' }, { accountNumber: CONTROL_ACCOUNTS.UNDEPOSITED_FUNDS }],
      },
      orderBy: { accountNumber: 'asc' },
      select: { id: true, name: true, accountNumber: true },
    }),
  ])

  const depositAccounts: DepositAccountOption[] = accounts
  const undeposited =
    accounts.find((a) => a.accountNumber === CONTROL_ACCOUNTS.UNDEPOSITED_FUNDS) ?? accounts[0]

  const customerParam =
    typeof params.customer === 'string' ? Number.parseInt(params.customer, 10) : Number.NaN
  const invoiceParam =
    typeof params.invoice === 'string' ? Number.parseInt(params.invoice, 10) : Number.NaN

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Receive payment"
        description="Money in: the deposit account is debited and accounts receivable relieved for the full amount."
      />
      <PaymentForm
        customers={customers}
        depositAccounts={depositAccounts}
        undepositedAccountId={undeposited?.id ?? null}
        initialCustomerId={Number.isFinite(customerParam) ? customerParam : null}
        initialInvoiceIds={Number.isFinite(invoiceParam) ? [invoiceParam] : []}
        today={toDateInput(startOfToday())}
        currency={currency}
      />
    </div>
  )
}
