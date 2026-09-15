import Link from 'next/link'
import { getAppContext } from '@/server/context'
import { analyticsDashboard } from '@/server/reports/analytics'
import { parseReportQuery, periodLabel } from '@/server/reports/params'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CashForecastChart, RankedBarChart, RevenueTrendChart } from './analytics-charts'

export const metadata = { title: 'Analytics' }

/**
 * The analytics dashboard: trend, cash forecast, who pays and what sells.
 *
 * Document-driven on purpose — it answers "what is happening" while the
 * statements answer "what does the ledger say". Every chart is paired with the
 * same figures in a table, so the page reads without colour and prints
 * usefully.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings, features } = await getAppContext()
  const query = parseReportQuery(await searchParams)
  const currency = settings.get('base_currency') || 'USD'
  const customerWord = features.nonprofit ? 'donors' : 'customers'

  const data = await analyticsDashboard(db, { from: query.from, to: query.to })

  const kpis = [
    { label: 'Invoiced', value: formatMoney(data.headline.invoiced, currency), sub: 'this period' },
    { label: 'Collected', value: formatMoney(data.headline.collected, currency), sub: 'payments received' },
    { label: 'Expenses', value: formatMoney(data.headline.expenses, currency), sub: 'posted to the ledger' },
    {
      label: 'Days sales outstanding',
      value: `${data.dso.days} days`,
      sub: `${formatMoney(data.dso.arBalance, currency)} open, averaging ${data.dso.averageAge} days old`,
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Analytics"
        description={periodLabel(query.from, query.to)}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/reports">All reports</Link>
          </Button>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="space-y-1 py-5">
              <dt className="text-muted-foreground text-sm">{kpi.label}</dt>
              <dd className="num text-2xl font-semibold tracking-tight">{kpi.value}</dd>
              <p className="text-muted-foreground text-xs">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Revenue trend</CardTitle>
          <p className="text-muted-foreground text-sm">
            Twelve months of invoicing against what was actually collected and spent.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RevenueTrendChart data={data.trend} currency={currency} />
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">Show the figures</summary>
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Month</TableHead>
                  <TableHead scope="col" numeric>Invoiced</TableHead>
                  <TableHead scope="col" numeric>Collected</TableHead>
                  <TableHead scope="col" numeric>Expenses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.trend.map((point) => (
                  <TableRow key={point.month}>
                    <TableCell>{point.label}</TableCell>
                    <TableCell numeric>{formatMoney(point.invoiced, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(point.collected, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(point.expenses, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cash forecast, next 90 days</CardTitle>
          <p className="text-muted-foreground text-sm">
            Cumulative: each point is everything receivable and payable due on or before that
            date, started from today&rsquo;s bank balance. The first point is what is already due.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <CashForecastChart data={data.forecast} currency={currency} />
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">Show the figures</summary>
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">By</TableHead>
                  <TableHead scope="col" numeric>Collections</TableHead>
                  <TableHead scope="col" numeric>Payments</TableHead>
                  <TableHead scope="col" numeric>Net</TableHead>
                  <TableHead scope="col" numeric>Projected cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.forecast.map((point) => (
                  <TableRow key={point.date}>
                    <TableCell>{point.date}</TableCell>
                    <TableCell numeric>{formatMoney(point.collections, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(point.payments, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(point.net, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(point.cash, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Top {customerWord}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/reports/sales-by-customer">Full report</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.customers.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing invoiced in this period.</p>
            ) : (
              <>
                <RankedBarChart
                  data={data.customers}
                  currency={currency}
                  label={`Revenue by ${customerWord} for the period`}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col" numeric>Revenue</TableHead>
                      <TableHead scope="col" numeric>Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>{customer.name}</TableCell>
                        <TableCell numeric>{formatMoney(customer.value, currency)}</TableCell>
                        <TableCell numeric>{customer.share.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Expense mix</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/reports/expenses-by-category">Full report</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.expenses.length === 0 ? (
              <p className="text-muted-foreground text-sm">No expenses posted in this period.</p>
            ) : (
              <>
                <RankedBarChart
                  data={data.expenses}
                  currency={currency}
                  label="Expenses by account for the period"
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Account</TableHead>
                      <TableHead scope="col" numeric>Amount</TableHead>
                      <TableHead scope="col" numeric>Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.name}</TableCell>
                        <TableCell numeric>{formatMoney(expense.value, currency)}</TableCell>
                        <TableCell numeric>{expense.share.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Top items</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/sales-by-item">Full report</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No items sold in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Item</TableHead>
                  <TableHead scope="col" numeric>Revenue</TableHead>
                  <TableHead scope="col" numeric>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell numeric>{formatMoney(item.value, currency)}</TableCell>
                    <TableCell numeric>{item.share.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
