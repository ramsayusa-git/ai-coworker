import Link from 'next/link'
import { PlusIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { vendor1099Summary, vendorBalances } from '@/server/purchasing'
import { formatMoney } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Prisma } from '@/generated/tenant/client'
import { VendorTable, type VendorRow } from './vendor-table'

export const metadata = { title: 'Vendors' }

/** Only these columns may drive the query — a sort key is user input. */
const SORTABLE = ['name', 'email', 'createdAt'] as const

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, { sort: 'name', dir: 'asc' })
  const currency = settings.get('base_currency') || 'USD'

  const show = typeof params.show === 'string' ? params.show : 'active'

  const where: Prisma.VendorWhereInput = {
    ...(show === 'active'
      ? { isActive: true }
      : show === 'inactive'
        ? { isActive: false }
        : show === '1099'
          ? { OR: [{ is1099Vendor: true }, { is1099Eligible: true }] }
          : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { companyName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'name'
  const orderBy = { [field]: dir } as Prisma.VendorOrderByWithRelationInput

  const [vendors, total] = await Promise.all([
    db.vendor.findMany({ where, orderBy, skip, take: pageSize }),
    db.vendor.count({ where }),
  ])

  const ids = vendors.map((vendor) => vendor.id)
  const [balances, overdue] = await Promise.all([
    vendorBalances(db, ids),
    db.bill.findMany({
      where: {
        vendorId: { in: ids },
        status: { in: ['UNPAID', 'PARTIAL'] },
        balanceDue: { gt: 0 },
        dueDate: { lt: new Date() },
      },
      select: { vendorId: true },
      distinct: ['vendorId'],
    }),
  ])
  const overdueIds = new Set(overdue.map((row) => row.vendorId))

  // The 1099 view answers a different question — what was actually paid this
  // year — so it gets its own panel rather than another column.
  const year = new Date().getUTCFullYear()
  const nec = show === '1099' ? await vendor1099Summary(db, year) : null

  const rows: VendorRow[] = vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    companyName: vendor.companyName,
    email: vendor.email,
    phone: vendor.phone,
    terms: vendor.terms,
    is1099: vendor.is1099Vendor || vendor.is1099Eligible,
    isActive: vendor.isActive,
    openBalance: formatMoney(balances.get(vendor.id) ?? 0, currency),
    overdue: overdueIds.has(vendor.id),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Vendors"
        description="Everyone you buy from, what you owe them and how you reach them."
        actions={
          <Button asChild size="sm">
            <Link href="/vendors/new"><PlusIcon /> New vendor</Link>
          </Button>
        }
      />
      <VendorTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter vendors">
            {(
              [
                ['active', 'Active'],
                ['1099', '1099'],
                ['inactive', 'Inactive'],
                ['all', 'All'],
              ] as const
            ).map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link href={`/vendors?show=${value}`} aria-current={show === value ? 'true' : undefined}>
                  {text}
                </Link>
              </Button>
            ))}
          </div>
        }
      />

      {nec && (
        <Card>
          <CardHeader>
            <CardTitle>1099 summary for {year}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <p className="text-muted-foreground px-5 pb-3 text-sm">
              What each tracked vendor was actually paid this year — allocated bill payments,
              excluding anything voided. A vendor is reportable at{' '}
              {formatMoney(nec.threshold, currency)} or more. Thresholds and form layouts change;
              check the current-year IRS instructions before filing.
            </p>
            {nec.rows.length === 0 ? (
              <p className="text-muted-foreground px-5 pb-5 text-sm">
                No vendor is flagged for 1099 tracking yet. Turn it on when you edit a vendor.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Tax ID</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>W-9</TableHead>
                    <TableHead numeric>Paid this year</TableHead>
                    <TableHead>Reportable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nec.rows.map((row) => (
                    <TableRow key={row.vendorId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.taxId ?? 'Missing'}</TableCell>
                      <TableCell className="text-muted-foreground">1099-{row.formType}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.w9OnFile ? 'On file' : 'Missing'}
                      </TableCell>
                      <TableCell numeric>{formatMoney(row.totalPaid, currency)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.reportable ? 'Yes' : 'Below threshold'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold" colSpan={4}>
                      {nec.reportableCount} reportable
                    </TableCell>
                    <TableCell numeric className="font-semibold">
                      {formatMoney(nec.total, currency)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
