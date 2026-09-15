import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { accountOptions } from '@/server/accounts'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { RulesBoard, type RuleRow } from './rules-board'

export const metadata = { title: 'Bank rules' }

export default async function BankRulesPage() {
  const { db } = await getAppContext()

  const [rules, accounts, unmatched] = await Promise.all([
    db.bankRule.findMany({
      include: { account: true },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    }),
    accountOptions(db),
    db.bankTransaction.count({ where: { matchStatus: 'UNMATCHED' } }),
  ])

  const rows: RuleRow[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    pattern: rule.pattern,
    ruleType: rule.ruleType,
    accountId: rule.accountId,
    accountLabel: rule.account
      ? rule.account.accountNumber
        ? `${rule.account.accountNumber} · ${rule.account.name}`
        : rule.account.name
      : null,
    priority: rule.priority,
    isActive: rule.isActive,
  }))

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Bank rules"
        description={`Rules suggest a category on imported statement lines — ${unmatched} line${unmatched === 1 ? '' : 's'} are waiting to review. They never post to the ledger on their own.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/banking">
              <ArrowLeftIcon /> Back to banking
            </Link>
          </Button>
        }
      />
      <RulesBoard rules={rows} accounts={accounts} />
    </div>
  )
}
