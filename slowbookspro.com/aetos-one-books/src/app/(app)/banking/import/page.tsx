import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { CSV_FORMAT_LABEL } from '@/server/banking'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportForm } from './import-form'

export const metadata = { title: 'Import a statement' }

export default async function BankImportPage() {
  const { db } = await getAppContext()

  const [feeds, batches] = await Promise.all([
    db.bankAccount.findMany({
      where: { isActive: true },
      include: { account: true },
      orderBy: { name: 'asc' },
    }),
    db.importBatch.findMany({
      include: { bankAccount: true },
      orderBy: { importedAt: 'desc' },
      take: 10,
    }),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Import a statement"
        description="Nothing posts on import. Every line lands in the review queue, deduplicated against what is already there."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/banking">
              <ArrowLeftIcon /> Back to banking
            </Link>
          </Button>
        }
      />

      <ImportForm
        feeds={feeds.map((feed) => ({
          id: feed.id,
          label: feed.account
            ? `${feed.name} → ${feed.account.name}`
            : `${feed.name} (not linked to an account)`,
          accountId: feed.accountId,
        }))}
      />

      {batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Feed</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead numeric>Parsed</TableHead>
                  <TableHead numeric>Imported</TableHead>
                  <TableHead numeric>Skipped</TableHead>
                  <TableHead numeric>Matched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="whitespace-nowrap">
                      {batch.importedAt.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      {batch.fileName ?? '—'}
                      {batch.occurrence > 0 && (
                        <Badge variant="warning" className="ml-2">
                          re-import #{batch.occurrence}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{batch.bankAccount.name}</TableCell>
                    <TableCell>
                      <Badge variant="muted">
                        {batch.csvFormat ? CSV_FORMAT_LABEL[batch.csvFormat] : batch.channel}
                      </Badge>
                    </TableCell>
                    <TableCell numeric>{batch.totalRows}</TableCell>
                    <TableCell numeric>{batch.importedRows}</TableCell>
                    <TableCell numeric>{batch.skippedRows}</TableCell>
                    <TableCell numeric>{batch.matchedRows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
