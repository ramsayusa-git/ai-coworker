import { getAppContext } from '@/server/context'
import { formatMoney } from '@/lib/money'
import { accountOptions } from '@/server/accounts'
import { listTransfers } from '@/server/banking'
import { PageHeader } from '@/components/app/page-header'
import { TransfersBoard, type TransferListRow } from './transfers-board'

export const metadata = { title: 'Transfers' }

export default async function TransfersPage() {
  const { db, settings } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'

  const [{ transfers }, accounts] = await Promise.all([
    listTransfers(db, { take: 100 }),
    accountOptions(db, { bankOnly: true }),
  ])

  const rows: TransferListRow[] = transfers.map((transfer) => ({
    id: transfer.id,
    date: transfer.date.toISOString().slice(0, 10),
    fromAccountName: transfer.fromAccountName,
    toAccountName: transfer.toAccountName,
    amount: formatMoney(transfer.amount, currency),
    memo: transfer.memo,
    reference: transfer.reference,
    voided: transfer.voided,
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Transfers"
        description="Money moving between your own accounts. Neither side is income or an expense, so a transfer never touches the profit and loss."
      />
      <TransfersBoard rows={rows} accounts={accounts} />
    </div>
  )
}
