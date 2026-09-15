import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { ensureDefaultAssetType } from '@/server/fixed-assets'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { AssetTypeEditor } from './type-editor'

export const metadata = { title: 'Asset types' }

export default async function AssetTypesPage() {
  const { db } = await getAppContext()
  const [types, accounts, counts] = await Promise.all([
    ensureDefaultAssetType(db),
    db.account.findMany({
      where: { isActive: true, accountType: { in: ['ASSET', 'EXPENSE'] } },
      orderBy: { accountNumber: 'asc' },
      select: { id: true, name: true, accountNumber: true },
    }),
    db.fixedAsset.groupBy({ by: ['assetTypeId'], _count: { _all: true } }),
  ])

  const used = new Map(counts.map((row) => [row.assetTypeId, row._count._all]))

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Asset types"
        description="How each kind of asset is written down, and which accounts it posts through."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fixed-assets"><ArrowLeftIcon /> Back to the register</Link>
            </Button>
            <AssetTypeEditor
              id={null}
              trigger="new"
              accounts={accounts}
              initial={{
                name: '',
                description: '',
                assetAccountId: null,
                accumulatedDepreciationAccountId: null,
                depreciationExpenseAccountId: null,
                depreciationMethod: 'STRAIGHT_LINE',
                effectiveLifeYears: '5',
                annualRatePercent: '20',
              }}
            />
          </>
        }
      />

      <Card>
        <CardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Life or rate</TableHead>
                <TableHead numeric>Assets</TableHead>
                <TableHead className="w-12" aria-label="Edit" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>
                    <p className="font-medium">{type.name}</p>
                    {type.description && (
                      <p className="text-muted-foreground text-xs">{type.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">
                      {type.depreciationMethod === 'STRAIGHT_LINE'
                        ? 'Straight line'
                        : 'Declining balance'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {type.depreciationMethod === 'STRAIGHT_LINE'
                      ? `${Number(type.effectiveLifeYears?.toString() ?? 0)} years`
                      : `${(Number(type.annualRate?.toString() ?? 0) * 100).toFixed(2)}% a year`}
                  </TableCell>
                  <TableCell numeric>{used.get(type.id) ?? 0}</TableCell>
                  <TableCell>
                    <AssetTypeEditor
                      id={type.id}
                      trigger="edit"
                      accounts={accounts}
                      initial={{
                        name: type.name,
                        description: type.description ?? '',
                        assetAccountId: type.assetAccountId,
                        accumulatedDepreciationAccountId: type.accumulatedDepreciationAccountId,
                        depreciationExpenseAccountId: type.depreciationExpenseAccountId,
                        depreciationMethod: type.depreciationMethod,
                        effectiveLifeYears: type.effectiveLifeYears?.toString() ?? '5',
                        annualRatePercent: (
                          Number(type.annualRate?.toString() ?? 0.2) * 100
                        ).toFixed(2),
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
