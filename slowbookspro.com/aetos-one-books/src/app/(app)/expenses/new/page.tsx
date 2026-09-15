import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { purchasingAccounts } from '@/server/purchasing'
import { PageHeader } from '@/components/app/page-header'
import { expenseAccountOptions, paymentAccountOptions } from '../../bills/editor-data'
import { ExpenseForm, type SpendDraft } from '../expense-form'

export const metadata = { title: 'Record spending' }

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const currency = settings.get('base_currency') || 'USD'

  const [vendors, expenseAccounts, paymentAccounts, cards, control] = await Promise.all([
    db.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, terms: true, defaultExpenseAccountId: true },
    }),
    expenseAccountOptions(db),
    paymentAccountOptions(db),
    db.account.findMany({
      where: { isActive: true, accountType: 'LIABILITY' },
      orderBy: { accountNumber: 'asc' },
      select: { id: true, name: true, accountNumber: true },
    }),
    purchasingAccounts(db),
  ])

  const kind = params.kind === 'card' ? ('card' as const) : ('expense' as const)
  const initial: SpendDraft = {
    kind,
    date: toDateInput(startOfToday()),
    vendorId: null,
    payee: '',
    expenseAccountId: null,
    paidFromAccountId: kind === 'card' ? control.creditCard : control.checking,
    amount: '',
    reference: '',
    memo: '',
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Record spending"
        description="Money already gone. There is no bill and nothing to pay later — this posts straight to the ledger."
      />
      <ExpenseForm
        initial={initial}
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        paymentAccounts={paymentAccounts}
        cardAccounts={cards}
        currency={currency}
      />
    </div>
  )
}
