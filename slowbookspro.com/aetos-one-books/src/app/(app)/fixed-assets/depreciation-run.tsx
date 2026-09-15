'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Field } from '@/components/app/sales-field'
import { runDepreciationAction } from './actions'

export type PreviewRow = { id: number; assetNumber: string; name: string; amount: string }

/**
 * Run depreciation. The preview is what a run *today* would post; changing the
 * date changes the answer, so the figures are labelled as of the date they were
 * worked out and the run itself recalculates on the server.
 */
export function DepreciationRun({
  today,
  preview,
  previewTotal,
}: {
  today: string
  preview: PreviewRow[]
  previewTotal: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [runDate, setRunDate] = React.useState(today)
  const [pending, startTransition] = React.useTransition()

  const submit = () => {
    startTransition(async () => {
      const result = await runDepreciationAction({ runDate })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.posted === 0
          ? 'Nothing to post — no whole month has passed since the last run.'
          : `${result.posted} asset${result.posted === 1 ? '' : 's'} depreciated, ${result.total} in total`,
      )
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarClockIcon /> Run depreciation
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run depreciation</DialogTitle>
            <DialogDescription>
              Every asset in service is written down by the whole months since it was last
              depreciated: depreciation expense debited, accumulated depreciation credited, one
              entry per asset. Book value never falls below salvage, and running twice for the same
              date posts nothing the second time.
            </DialogDescription>
          </DialogHeader>

          <Field label="Run up to" htmlFor="run-date" hint="Usually the last day of the month you are closing.">
            <Input
              id="run-date"
              type="date"
              value={runDate}
              onChange={(event) => setRunDate(event.target.value)}
            />
          </Field>

          {preview.length > 0 ? (
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead numeric>As at {today}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <span className="font-medium">{row.assetNumber}</span>{' '}
                        <span className="text-muted-foreground">{row.name}</span>
                      </TableCell>
                      <TableCell numeric>{row.amount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nothing is due as at {today}. A different run date may still post something.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Posting…' : `Post ${previewTotal}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
