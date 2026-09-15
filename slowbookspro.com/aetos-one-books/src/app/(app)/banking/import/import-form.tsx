'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileUpIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export type FeedOption = { id: number; label: string; accountId: number | null }

type PreviewRow = {
  date: string
  amount: string
  payee: string
  description: string
  checkNumber: string | null
  fee: string | null
}

type Preview = {
  channel: string
  format: string | null
  formatLabel: string
  headers: string[]
  error: string | null
  warnings: string[]
  count: number
  rows: PreviewRow[]
}

type Summary = {
  total: number
  imported: number
  skipped: number
  matched: number
  categorised: number
  errors: string[]
  formatLabel: string
  duplicateFile: boolean
}

const MAX_BYTES = 20 * 1024 * 1024

/**
 * Two deliberate steps: parse and show what was found, then write. The preview
 * is what turns "why did 40 rows become 12?" into something a person can see
 * before anything is committed.
 */
export function ImportForm({ feeds }: { feeds: FeedOption[] }) {
  const router = useRouter()
  const [feedId, setFeedId] = React.useState(feeds[0] ? String(feeds[0].id) : '')
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const send = async (mode: 'preview' | 'import') => {
    if (!file || !feedId) return
    if (file.size > MAX_BYTES) {
      setError('That file is too large — the limit is 20 MB.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('bankAccountId', feedId)
      body.set('mode', mode)
      const response = await fetch('/api/banking/import', { method: 'POST', body })
      const payload: unknown = await response.json()
      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : 'That statement could not be read.'
        setError(message)
        return
      }
      if (mode === 'preview') {
        const result = payload as Preview
        setPreview(result)
        setSummary(null)
        if (result.error) setError(result.error)
      } else {
        const result = payload as Summary
        setSummary(result)
        setPreview(null)
        toast.success(`${result.imported} line${result.imported === 1 ? '' : 's'} imported`)
        router.refresh()
      }
    } catch {
      setError('The upload did not complete. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const selectedFeed = feeds.find((f) => String(f.id) === feedId)

  if (feeds.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6 text-sm">
          <p>
            There is no statement feed to import into yet. A feed links a bank or card account in
            the chart of accounts to the statements you download from the bank.
          </p>
          <Button asChild size="sm">
            <Link href="/banking">Add a feed on the banking page</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Upload a statement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-feed">Import into</Label>
              <Select value={feedId} onValueChange={setFeedId}>
                <SelectTrigger id="import-feed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {feeds.map((feed) => (
                    <SelectItem key={feed.id} value={String(feed.id)}>
                      {feed.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFeed && !selectedFeed.accountId && (
                <p role="alert" className="text-destructive text-xs">
                  This feed is not linked to a ledger account yet, so nothing can post from it.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-file">Statement file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".ofx,.qfx,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setPreview(null)
                  setSummary(null)
                  setError(null)
                }}
              />
              <p className="text-muted-foreground text-xs">
                OFX, QFX or CSV, up to 20 MB. The layout is detected from the columns, not the
                filename.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
              <TriangleAlertIcon className="size-4" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!file || busy}
              onClick={() => void send('preview')}
            >
              <FileUpIcon /> Preview
            </Button>
            <Button
              disabled={!file || busy || (preview !== null && preview.count === 0)}
              onClick={() => void send('import')}
            >
              <UploadIcon /> Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && !preview.error && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>
              {preview.formatLabel} · {preview.count} row{preview.count === 1 ? '' : 's'}
            </CardTitle>
            <Badge variant="muted">{preview.channel}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.headers.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Columns mapped from</p>
                <div className="flex flex-wrap gap-1">
                  {preview.headers.map((header) => (
                    <Badge key={header} variant="outline">
                      {header}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-warning-foreground text-xs">
                  {preview.warnings.length} row{preview.warnings.length === 1 ? '' : 's'} could not
                  be read and will be skipped
                </p>
                <ul className="text-muted-foreground max-h-32 space-y-0.5 overflow-y-auto text-xs">
                  {preview.warnings.slice(0, 20).map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden sm:table-cell">Check</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                      <TableCell className="max-w-48 truncate">{row.payee || '—'}</TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-64 truncate md:table-cell">
                        {row.description || '—'}
                        {row.fee && ` (fee ${row.fee})`}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {row.checkNumber || '—'}
                      </TableCell>
                      <TableCell numeric>{row.amount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.count > preview.rows.length && (
              <p className="text-muted-foreground text-xs">
                Showing the first {preview.rows.length} of {preview.count}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Import finished</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.duplicateFile && (
              <p className="text-warning-foreground flex items-center gap-2 text-sm">
                <TriangleAlertIcon className="size-4" />
                This exact file has been imported before. Rows already in the feed were skipped.
              </p>
            )}
            <dl className="grid gap-4 sm:grid-cols-5">
              {[
                ['Parsed', summary.total],
                ['Imported', summary.imported],
                ['Already there', summary.skipped],
                ['Auto-matched', summary.matched],
                ['Categorised', summary.categorised],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="num text-2xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            {summary.errors.length > 0 && (
              <ul className="text-muted-foreground max-h-32 space-y-0.5 overflow-y-auto text-xs">
                {summary.errors.slice(0, 20).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            )}

            <Button asChild size="sm">
              <Link href="/banking?view=review">Review the imported lines</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
