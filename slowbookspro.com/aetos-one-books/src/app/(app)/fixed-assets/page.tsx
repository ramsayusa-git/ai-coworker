import Link from 'next/link'
import { PlusIcon, SettingsIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import {
  assetReconciliation,
  bookValue,
  ensureDefaultAssetType,
  previewDepreciation,
} from '@/server/fixed-assets'
import { formatMoney } from '@/lib/money'
import { listParams } from '@/lib/list-params'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Prisma } from '@/generated/tenant/client'
import { AssetTable, type AssetRow } from './asset-table'
import { DepreciationRun, type PreviewRow } from './depreciation-run'

export const metadata = { title: 'Fixed assets' }

const SORTABLE = ['assetNumber', 'purchaseDate', 'status'] as const

const METHOD_LABEL: Record<string, string> = {
  STRAIGHT_LINE: 'Straight line',
  DECLINING_BALANCE: 'Declining balance',
}

export default async function FixedAssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { db, settings } = await getAppContext()
  const params = await searchParams
  const { q, sort, dir, page, pageSize, skip } = listParams(params, {
    sort: 'assetNumber',
    dir: 'asc',
  })
  const currency = settings.get('base_currency') || 'USD'
  const today = startOfToday()

  // A company that has never set a type gets one, so the register is usable the
  // first time it is opened.
  await ensureDefaultAssetType(db)

  const show = typeof params.show === 'string' ? params.show : 'inService'

  const where: Prisma.FixedAssetWhereInput = {
    ...(show === 'inService'
      ? { status: 'REGISTERED' }
      : show === 'disposed'
        ? { status: 'DISPOSED' }
        : {}),
    ...(q
      ? {
          OR: [
            { assetNumber: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'assetNumber'
  const orderBy: Prisma.FixedAssetOrderByWithRelationInput[] = [{ [field]: dir }, { id: 'asc' }]

  const [assets, total, reconciliation, preview] = await Promise.all([
    db.fixedAsset.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: { assetType: { select: { name: true, depreciationMethod: true } } },
    }),
    db.fixedAsset.count({ where }),
    assetReconciliation(db),
    previewDepreciation(db, today),
  ])

  const rows: AssetRow[] = assets.map((asset) => ({
    id: asset.id,
    assetNumber: asset.assetNumber,
    name: asset.name,
    typeName: asset.assetType.name,
    method: METHOD_LABEL[asset.assetType.depreciationMethod] ?? asset.assetType.depreciationMethod,
    purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
    status: asset.status,
    cost: formatMoney(asset.purchasePrice.toString(), currency),
    accumulated: formatMoney(asset.accumulatedDepreciation.toString(), currency),
    bookValue: formatMoney(bookValue(asset), currency),
  }))

  const previewRows: PreviewRow[] = preview.rows.map((row) => ({
    id: row.id,
    assetNumber: row.assetNumber,
    name: row.name,
    amount: formatMoney(row.amount, currency),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Fixed assets"
        description="What you own, what it has been written down to, and what the next run will post."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fixed-assets/types"><SettingsIcon /> Types</Link>
            </Button>
            <DepreciationRun
              today={toDateInput(today)}
              preview={previewRows}
              previewTotal={formatMoney(preview.total, currency)}
            />
            <Button asChild size="sm">
              <Link href="/fixed-assets/new"><PlusIcon /> Register an asset</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Cost in service</p>
            <p className="num mt-1 text-xl font-semibold">
              {formatMoney(reconciliation.totalCost, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Accumulated depreciation</p>
            <p className="num mt-1 text-xl font-semibold">
              {formatMoney(reconciliation.totalAccumulated, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Book value</p>
            <p className="num mt-1 text-xl font-semibold">
              {formatMoney(reconciliation.totalBookValue, currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">Due as at {toDateInput(today)}</p>
            <p className="num mt-1 text-xl font-semibold">{formatMoney(preview.total, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <AssetTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <div className="flex items-center gap-1" role="group" aria-label="Filter the register">
            {(
              [
                ['inService', 'In service'],
                ['disposed', 'Disposed'],
                ['all', 'All'],
              ] as const
            ).map(([value, text]) => (
              <Button key={value} asChild size="sm" variant={show === value ? 'secondary' : 'ghost'}>
                <Link
                  href={`/fixed-assets?show=${value}`}
                  aria-current={show === value ? 'true' : undefined}
                >
                  {text}
                </Link>
              </Button>
            ))}
          </div>
        }
      />

      {reconciliation.rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Register by type</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead numeric>Assets</TableHead>
                  <TableHead numeric>Cost</TableHead>
                  <TableHead numeric>Depreciation</TableHead>
                  <TableHead numeric>Book value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliation.rows.map((row) => (
                  <TableRow key={row.assetTypeId}>
                    <TableCell className="font-medium">{row.assetType}</TableCell>
                    <TableCell numeric>{row.count}</TableCell>
                    <TableCell numeric>{formatMoney(row.cost, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(row.accumulated, currency)}</TableCell>
                    <TableCell numeric>{formatMoney(row.bookValue, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell numeric />
                  <TableCell numeric>{formatMoney(reconciliation.totalCost, currency)}</TableCell>
                  <TableCell numeric>
                    {formatMoney(reconciliation.totalAccumulated, currency)}
                  </TableCell>
                  <TableCell numeric>
                    {formatMoney(reconciliation.totalBookValue, currency)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
