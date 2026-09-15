import { getAppContext } from '@/server/context'
import { formatMoney } from '@/lib/money'
import { accountOptions } from '@/server/accounts'
import { listDeposits, pendingDeposits } from '@/server/banking'
import { PageHeader } from '@/components/app/page-header'
import { DepositsBoard, type DepositListRow, type PendingRow } from './deposits-board'

export const metadata = { title: 'Deposits' }

export default async function DepositsPage() {
  const { db, settings } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'

  const [pending, deposits, accounts] = await Promise.all([
    pendingDeposits(db),
    listDeposits(db, { take: 50 }),
    accountOptions(db, { bankOnly: true }),
  ])

  const pendingRows: PendingRow[] = pending.map((line) => ({
    transactionLineId: line.transactionLineId,
    transactionId: line.transactionId,
    date: line.date.toISOString().slice(0, 10),
    description: line.description,
    reference: line.reference,
    sourceType: line.sourceType,
    amount: line.amount.toFixed(2),
    amountLabel: formatMoney(line.amount, currency),
  }))

  const depositRows: DepositListRow[] = deposits.map((deposit) => ({
    id: deposit.id,
    date: deposit.date.toISOString().slice(0, 10),
    accountName: deposit.accountName,
    amount: formatMoney(deposit.amount, currency),
    reference: deposit.reference,
    voided: deposit.voided,
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Deposits"
        description="Payments you have received sit in Undeposited Funds until the money reaches the bank. A deposit moves them across in one entry, so the bank line matches the slip you actually took to the bank."
      />
      <DepositsBoard
        pending={pendingRows}
        deposits={depositRows}
        accounts={accounts}
        currency={currency}
      />
    </div>
  )
}
