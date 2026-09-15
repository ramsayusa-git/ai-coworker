import Link from 'next/link'
import {
  BanknoteIcon,
  FileTextIcon,
  PlusIcon,
  ReceiptIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { getAppContext } from '@/server/context'
import {
  apAging,
  arAging,
  cashPosition,
  monthlySeries,
  profitAndLoss,
} from '@/server/reports/financials'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Widget, WidgetGrid } from '@/components/app/widget-grid'
import { CashflowChart } from './cashflow-chart'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const { db, settings, org } = await getAppContext()
  const currency = settings.get('base_currency') || 'USD'
  const today = new Date()
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))

  const [cash, ar, ap, mtd, ytd, series, recent] = await Promise.all([
    cashPosition(db, today),
    arAging(db, today),
    apAging(db, today),
    profitAndLoss(db, monthStart, today),
    profitAndLoss(db, yearStart, today),
    monthlySeries(db, 12, today),
    db.transaction.findMany({
      where: { isVoided: false },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 8,
      include: { transactionLines: { include: { account: true } } },
    }),
  ])

  const kpis = [
    {
      id: 'kpi-cash',
      label: 'Cash on hand',
      value: formatMoney(cash.cash, currency),
      sub: `${cash.accounts.filter((a) => a.account.bankKind === 'bank').length} bank accounts`,
      icon: BanknoteIcon,
      href: undefined as string | undefined,
    },
    {
      id: 'kpi-ar',
      label: 'Accounts receivable',
      value: formatMoney(ar.grandTotal, currency),
      sub: `${ar.rows.length} customers owing`,
      icon: FileTextIcon,
      href: '/reports/ar-aging',
    },
    {
      id: 'kpi-ap',
      label: 'Accounts payable',
      value: formatMoney(ap.grandTotal, currency),
      sub: `${ap.rows.length} vendors to pay`,
      icon: ReceiptIcon,
      href: '/reports/ap-aging',
    },
    {
      id: 'kpi-net',
      label: 'Net income, month to date',
      value: formatMoney(mtd.netIncome, currency),
      sub: `${formatMoney(ytd.netIncome, currency)} year to date`,
      icon: TrendingUpIcon,
      href: '/reports/profit-and-loss',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Good ${greeting()}`}
        description={`${org.name} — ${today.toLocaleDateString('en-US', { dateStyle: 'full' })}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/expenses/new">Record expense</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/invoices/new"><PlusIcon /> New invoice</Link>
            </Button>
          </>
        }
      />

      <WidgetGrid storageKey={`dashboard-layout:${org.id}`}>
        {[
          ...kpis.map((kpi) => {
            const Icon = kpi.icon
            const body = (
              <CardContent className="space-y-1 py-1">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Icon className="size-4" />
                  {kpi.label}
                </div>
                <p className="num text-2xl font-semibold tracking-tight">{kpi.value}</p>
                <p className="text-muted-foreground text-xs">{kpi.sub}</p>
              </CardContent>
            )
            return (
              <Widget key={kpi.id} id={kpi.id} defaultSpan={1}>
                {kpi.href ? (
                  <Link href={kpi.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </Widget>
            )
          }),

          <Widget key="chart" id="chart" title="Income and expense" defaultSpan={2}>
            <CashflowChart data={series} currency={currency} />
          </Widget>,

          <Widget key="aging" id="aging" title="Receivables aging" defaultSpan={1}>
            <div className="space-y-3">
              {ar.buckets.map((bucket) => {
                const amount = ar.totals[bucket]
                const pct = ar.grandTotal.isZero()
                  ? 0
                  : amount.dividedBy(ar.grandTotal).times(100).toNumber()
                return (
                  <div key={bucket} className="space-y-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className={bucket === '90+' ? 'text-destructive font-medium' : ''}>
                        {bucket === 'Current' ? 'Not yet due' : `${bucket} days`}
                      </span>
                      <span className="num">{formatMoney(amount, currency)}</span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className={bucket === '90+' ? 'bg-destructive h-full' : 'bg-primary h-full'}
                        style={{ width: `${Math.max(pct, amount.isZero() ? 0 : 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Widget>,

          <Widget key="activity" id="activity" defaultSpan={3} resizable={false}>
            <div className="flex items-center justify-between px-0 pb-3">
              <h3 className="text-sm font-medium">Recent activity</h3>
              <Button asChild variant="ghost" size="sm">
                <Link href="/journal">View journal</Link>
              </Button>
            </div>
            {recent.length === 0 ? (
              <p className="text-muted-foreground pb-6 text-sm">
                Nothing posted yet. Create an invoice or record an expense to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((tx) => {
                    const amount = tx.transactionLines.reduce(
                      (acc, l) => acc + Number(l.debit),
                      0,
                    )
                    const accounts = tx.transactionLines
                      .map((l) => l.account.name)
                      .slice(0, 2)
                      .join(' → ')
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap">
                          {tx.date.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell className="max-w-72 truncate">
                          {tx.description ?? tx.reference ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">{tx.sourceType ?? 'journal'}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-64 truncate text-xs">
                          {accounts}
                          {tx.transactionLines.length > 2 && ` +${tx.transactionLines.length - 2}`}
                        </TableCell>
                        <TableCell numeric>{formatMoney(amount, currency)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Widget>,
        ]}
      </WidgetGrid>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
