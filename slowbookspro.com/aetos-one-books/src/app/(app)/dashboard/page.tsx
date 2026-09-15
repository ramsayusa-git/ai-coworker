import Link from 'next/link'
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
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
      label: 'Cash on hand',
      value: formatMoney(cash.cash, currency),
      sub: `${cash.accounts.filter((a) => a.account.bankKind === 'bank').length} bank accounts`,
      icon: BanknoteIcon,
      tone: 'default' as const,
    },
    {
      label: 'Accounts receivable',
      value: formatMoney(ar.grandTotal, currency),
      sub: `${ar.rows.length} customers owing`,
      icon: FileTextIcon,
      tone: 'positive' as const,
      href: '/reports/ar-aging',
    },
    {
      label: 'Accounts payable',
      value: formatMoney(ap.grandTotal, currency),
      sub: `${ap.rows.length} vendors to pay`,
      icon: ReceiptIcon,
      tone: 'negative' as const,
      href: '/reports/ap-aging',
    },
    {
      label: 'Net income, month to date',
      value: formatMoney(mtd.netIncome, currency),
      sub: `${formatMoney(ytd.netIncome, currency)} year to date`,
      icon: TrendingUpIcon,
      tone: mtd.netIncome.isNegative() ? ('negative' as const) : ('positive' as const),
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          const body = (
            <Card className="h-full transition-shadow hover:shadow-sm">
              <CardContent className="space-y-1 py-5">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Icon className="size-4" />
                  {kpi.label}
                </div>
                <p className="num text-2xl font-semibold tracking-tight">{kpi.value}</p>
                <p className="text-muted-foreground text-xs">{kpi.sub}</p>
              </CardContent>
            </Card>
          )
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href}>{body}</Link>
          ) : (
            <div key={kpi.label}>{body}</div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Income and expense</CardTitle>
          </CardHeader>
          <CardContent>
            <CashflowChart data={series} currency={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receivables aging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent activity</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/journal">View journal</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {recent.length === 0 ? (
            <p className="text-muted-foreground px-5 pb-6 text-sm">
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
        </CardContent>
      </Card>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
