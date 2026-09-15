import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PencilIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { startOfToday, toDateInput } from '@/server/sales'
import { bookValue, depreciationSchedule, periodDepreciation } from '@/server/fixed-assets'
import { purchasingAccounts } from '@/server/purchasing'
import { formatMoney, money } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { paymentAccountOptions } from '../../bills/editor-data'
import { DisposeAsset } from './asset-actions'

export const metadata = { title: 'Fixed asset' }

const METHOD_LABEL: Record<string, string> = {
  STRAIGHT_LINE: 'Straight line',
  DECLINING_BALANCE: 'Declining balance',
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, settings } = await getAppContext()
  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) notFound()

  const asset = await db.fixedAsset.findUnique({ where: { id }, include: { assetType: true } })
  if (!asset) notFound()

  const currency = settings.get('base_currency') || 'USD'
  const today = startOfToday()

  const [postings, accounts, control] = await Promise.all([
    db.transaction.findMany({
      where: { sourceId: asset.id, sourceType: { in: ['depreciation', 'asset_disposal'] } },
      orderBy: { id: 'asc' },
      include: { transactionLines: { include: { account: true } } },
    }),
    paymentAccountOptions(db),
    purchasingAccounts(db),
  ])

  const schedule = depreciationSchedule(asset, asset.assetType).slice(0, 120)
  const book = bookValue(asset)

  // What a run today would take. A zero here means no whole month has passed.
  let due = money(0)
  try {
    due = periodDepreciation(asset, asset.assetType, today)
  } catch {
    // A type missing its life or rate cannot be projected; the run itself says so.
  }

  const accumulated = money(asset.accumulatedDepreciation.toString())
  const cost = money(asset.purchasePrice.toString())
  const progress = cost.greaterThan(0)
    ? Math.min(100, Math.round(accumulated.dividedBy(cost).times(100).toNumber()))
    : 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`${asset.assetNumber} · ${asset.name}`}
        description={`${asset.assetType.name} · purchased ${asset.purchaseDate.toISOString().slice(0, 10)}`}
        actions={
          asset.status === 'DISPOSED' ? null : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/fixed-assets/${asset.id}/edit`}><PencilIcon /> Edit</Link>
              </Button>
              <DisposeAsset
                id={asset.id}
                assetNumber={asset.assetNumber}
                bookValue={book.toFixed(2)}
                today={toDateInput(today)}
                accounts={accounts}
                defaultAccountId={control.checking}
              />
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {asset.status === 'DISPOSED' ? (
          <Badge variant="outline">
            Disposed {asset.disposalDate?.toISOString().slice(0, 10) ?? ''}
          </Badge>
        ) : (
          <Badge variant="muted">In service</Badge>
        )}
        <Badge variant="outline">
          {METHOD_LABEL[asset.assetType.depreciationMethod] ?? asset.assetType.depreciationMethod}
        </Badge>
        {asset.assetType.depreciationMethod === 'STRAIGHT_LINE' && asset.assetType.effectiveLifeYears && (
          <span className="text-muted-foreground text-sm">
            {Number(asset.assetType.effectiveLifeYears.toString())} year life
          </span>
        )}
        {asset.assetType.depreciationMethod === 'DECLINING_BALANCE' && asset.assetType.annualRate && (
          <span className="text-muted-foreground text-sm">
            {(Number(asset.assetType.annualRate.toString()) * 100).toFixed(2)}% a year
          </span>
        )}
        {asset.lastDepreciationDate && (
          <span className="text-muted-foreground text-sm">
            Last run {asset.lastDepreciationDate.toISOString().slice(0, 10)}
          </span>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {schedule.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  This asset&rsquo;s type has no life or rate set, so no schedule can be worked out.
                  Set one on the type and it will appear here.
                </p>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead numeric>Period</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead numeric>Opening</TableHead>
                        <TableHead numeric>Charge</TableHead>
                        <TableHead numeric>Accumulated</TableHead>
                        <TableHead numeric>Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedule.map((row) => (
                        <TableRow key={row.period}>
                          <TableCell numeric>{row.period}</TableCell>
                          <TableCell>{row.date.toISOString().slice(0, 10)}</TableCell>
                          <TableCell numeric>{formatMoney(row.openingBookValue, currency)}</TableCell>
                          <TableCell numeric>{formatMoney(row.charge, currency)}</TableCell>
                          <TableCell numeric>{formatMoney(row.accumulated, currency)}</TableCell>
                          <TableCell numeric>{formatMoney(row.closingBookValue, currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>What this posted</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {postings.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  Nothing yet. Depreciation posts at the next run.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead numeric>Debit</TableHead>
                      <TableHead numeric>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postings.flatMap((posting) =>
                      posting.transactionLines.map((line) => (
                        <TableRow key={line.id} className={posting.isVoided ? 'opacity-60' : undefined}>
                          <TableCell>{posting.date.toISOString().slice(0, 10)}</TableCell>
                          <TableCell>
                            <span className="text-muted-foreground mr-2 text-xs">
                              {line.account.accountNumber}
                            </span>
                            {line.account.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {posting.sourceType === 'asset_disposal' ? 'Disposal' : 'Depreciation'}
                          </TableCell>
                          <TableCell numeric>
                            {money(line.debit.toString()).isZero()
                              ? ''
                              : formatMoney(line.debit.toString(), currency)}
                          </TableCell>
                          <TableCell numeric>
                            {money(line.credit.toString()).isZero()
                              ? ''
                              : formatMoney(line.credit.toString(), currency)}
                          </TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader><CardTitle>Position</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Cost" value={formatMoney(asset.purchasePrice.toString(), currency)} />
              <Row
                label="Depreciation taken"
                value={formatMoney(asset.accumulatedDepreciation.toString(), currency)}
                muted
              />
              <Separator />
              <Row label="Book value" value={formatMoney(book, currency)} strong />
              <Row label="Salvage" value={formatMoney(asset.salvageValue.toString(), currency)} muted />
              <div
                className="bg-muted h-2 overflow-hidden rounded-full"
                role="img"
                aria-label={`${progress}% of cost written down`}
              >
                <div className="bg-primary h-full" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-muted-foreground text-xs">{progress}% of cost written down</p>
            </CardContent>
          </Card>

          {asset.status !== 'DISPOSED' && (
            <Card>
              <CardHeader><CardTitle>Next run</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label={`Due as at ${toDateInput(today)}`} value={formatMoney(due, currency)} strong />
                <p className="text-muted-foreground text-xs">
                  A run posts depreciation expense against accumulated depreciation, one entry per
                  asset. Nothing is due until a whole month has passed.
                </p>
              </CardContent>
            </Card>
          )}

          {asset.status === 'DISPOSED' && (
            <Card>
              <CardHeader><CardTitle>Disposal</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Date" value={asset.disposalDate?.toISOString().slice(0, 10) ?? '—'} />
                <Row
                  label="Proceeds"
                  value={formatMoney(asset.disposalProceeds?.toString() ?? 0, currency)}
                />
              </CardContent>
            </Card>
          )}

          {asset.description && (
            <Card>
              <CardHeader><CardTitle>Description</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{asset.description}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
