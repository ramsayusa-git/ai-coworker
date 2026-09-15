import { getAppContext } from '@/server/context'
import { accountTree, type AccountNode } from '@/server/accounts'
import { formatMoney } from '@/lib/money'
import { ROLE_RANK } from '@/lib/rbac'
import { PageHeader } from '@/components/app/page-header'
import { AccountsFooterNote, Chart, type ChartNode } from './chart'

export const metadata = { title: 'Chart of accounts' }

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const includeInactive = params.inactive === '1'
  const { db, settings, session } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'

  const { roots, flat } = await accountTree(db, { includeInactive })

  // Decimals are formatted here so the client component never has to carry a
  // money library — and never rounds a balance itself.
  const toChart = (node: AccountNode): ChartNode => ({
    id: node.id,
    name: node.name,
    accountNumber: node.accountNumber,
    accountType: node.accountType,
    parentId: node.parentId,
    description: node.description,
    bankKind: node.bankKind,
    isActive: node.isActive ?? true,
    isControl: node.isControl,
    controlPurpose: node.controlPurpose,
    lineCount: node.lineCount,
    depth: node.depth,
    balance: formatMoney(node.balance, currency),
    rollup: formatMoney(node.rollup, currency),
    children: node.children.map(toChart),
  })

  const tree = roots.map(toChart)
  const flatten = (nodes: ChartNode[]): ChartNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)])

  const rank = ROLE_RANK[session.role]

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Chart of accounts"
        description="The shape of the ledger. Balances come from posted transactions, never from a stored number."
      />
      <Chart
        roots={tree}
        flat={flatten(tree)}
        currency={currency}
        canEdit={rank >= ROLE_RANK.BOOKKEEPER}
        canDelete={rank >= ROLE_RANK.ADMIN}
      />
      <AccountsFooterNote total={flat.length} currency={currency} />
    </div>
  )
}
