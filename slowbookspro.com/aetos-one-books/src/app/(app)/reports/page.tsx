import Link from 'next/link'
import {
  BarChart3Icon,
  BoxesIcon,
  ChevronRightIcon,
  ReceiptIcon,
  ScaleIcon,
} from 'lucide-react'
import { getAppContext } from '@/server/context'
import { FAMILIES, REPORTS, type ReportFamily } from '@/server/reports/registry'
import { PageHeader } from '@/components/app/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Reports' }

const ICONS: Record<ReportFamily, React.ComponentType<{ className?: string }>> = {
  statements: ScaleIcon,
  sales: BarChart3Icon,
  purchases: ReceiptIcon,
  inventory: BoxesIcon,
}

/** Reports the reader is most likely to want first, as a shortcut row. */
const PINNED = ['profit-and-loss', 'balance-sheet', 'ar-aging', 'cash-flow']

export default async function ReportsIndexPage() {
  const { features } = await getAppContext()
  const families = FAMILIES.filter(
    (family) => family.id !== 'inventory' || features.inventory,
  )
  const pinned = PINNED.map((id) => REPORTS.find((report) => report.id === id)).filter(
    (report): report is (typeof REPORTS)[number] => Boolean(report),
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Reports"
        description="Every report reads the ledger the same way, takes the same period and filters, and exports the same figures."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/analytics">Analytics dashboard</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pinned.map((report) => (
          <Link
            key={report.id}
            href={`/reports/${report.id}`}
            className="bg-card hover:border-primary/40 rounded-xl border px-4 py-3 transition-colors"
          >
            <p className="text-sm font-medium">{report.title}</p>
            <p className="text-muted-foreground mt-1 text-xs">{report.description}</p>
          </Link>
        ))}
      </div>

      {families.map((family) => {
        const Icon = ICONS[family.id]
        const reports = REPORTS.filter((report) => report.family === family.id)
        return (
          <Card key={family.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="text-muted-foreground size-4" />
                {family.title}
              </CardTitle>
              <p className="text-muted-foreground text-sm">{family.description}</p>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <ul className="divide-y border-t">
                {reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/reports/${report.id}`}
                      className="hover:bg-muted/40 flex items-center justify-between gap-4 px-5 py-3 transition-colors"
                    >
                      <span>
                        <span className="block text-sm font-medium">{report.title}</span>
                        <span className="text-muted-foreground block text-xs">
                          {report.description}
                        </span>
                      </span>
                      <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
