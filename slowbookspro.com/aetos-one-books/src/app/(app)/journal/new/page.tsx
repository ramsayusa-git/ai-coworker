import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getAppContext } from '@/server/context'
import { accountOptions, dimensionOptions } from '@/server/accounts'
import { getClosingDate } from '@/server/ledger'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { JournalEditor } from '../journal-editor'

export const metadata = { title: 'New journal entry' }

export default async function NewJournalEntryPage() {
  const { db, settings } = await getAppContext()
  const [accounts, dimensions, closingDate] = await Promise.all([
    accountOptions(db),
    dimensionOptions(db),
    getClosingDate(db),
  ])
  const currency = settings.get('base_currency') || 'USD'
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="New journal entry"
        description={
          closingDate
            ? `Books are closed through ${closingDate.toISOString().slice(0, 10)}. Date this entry after that.`
            : 'Debits and credits must agree to the cent before this can be posted.'
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/journal">
              <ArrowLeftIcon /> Back to journal
            </Link>
          </Button>
        }
      />
      <JournalEditor
        accounts={accounts}
        classes={dimensions.classes}
        jobs={dimensions.jobs}
        currency={currency}
        today={today}
      />
    </div>
  )
}
