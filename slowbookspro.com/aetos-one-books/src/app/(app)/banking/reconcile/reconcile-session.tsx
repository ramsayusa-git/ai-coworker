'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  completeReconciliationAction,
  setAllClearedAction,
  toggleClearedAction,
  undoReconciliationAction,
} from '../actions'

export type SessionLine = {
  lineId: number
  transactionId: number
  date: string
  description: string
  reference: string
  amount: string
  isPositive: boolean
  cleared: boolean
  matched: boolean
  sourceType: string
}

/**
 * The live session. Every tick re-asks the server for the difference rather
 * than adding up in the browser, so what the Finish button checks is the same
 * number the person is looking at.
 */
export function ReconcileSession({
  reconciliationId,
  accountName,
  statementDate,
  statementBalance,
  beginningBalance,
  clearedTotal,
  unclearedTotal,
  difference,
  isBalanced,
  clearedCount,
  completed,
  lines,
}: {
  reconciliationId: number
  accountName: string
  statementDate: string
  statementBalance: string
  beginningBalance: string
  clearedTotal: string
  unclearedTotal: string
  difference: string
  isBalanced: boolean
  clearedCount: number
  completed: boolean
  lines: SessionLine[]
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [confirmUndo, setConfirmUndo] = React.useState(false)

  const toggle = (line: SessionLine) =>
    startTransition(async () => {
      const result = await toggleClearedAction({ reconciliationId, lineId: line.lineId })
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })

  const setAll = (cleared: boolean) =>
    startTransition(async () => {
      const result = await setAllClearedAction({ reconciliationId, cleared })
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })

  const finish = () =>
    startTransition(async () => {
      const result = await completeReconciliationAction({ id: reconciliationId })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(`Reconciled — ${result.clearedCount} lines closed`)
        router.refresh()
      }
    })

  const undo = () =>
    startTransition(async () => {
      const result = await undoReconciliationAction({ id: reconciliationId })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(
          result.outcome === 'abandoned'
            ? 'Session discarded — the ticks stayed on the lines'
            : 'Reopened for editing',
        )
        setConfirmUndo(false)
        router.refresh()
      }
    })

  const stats: Array<[string, string]> = [
    ['Beginning balance', beginningBalance],
    ['Cleared', clearedTotal],
    ['Uncleared', unclearedTotal],
    ['Statement balance', statementBalance],
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                {accountName} · statement dated {statementDate}
              </h2>
              <p className="text-muted-foreground text-sm">
                {clearedCount} of {lines.length} line{lines.length === 1 ? '' : 's'} ticked
                {completed && ' · finished'}
              </p>
            </div>
            <div
              role="status"
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-3 py-2',
                isBalanced ? 'text-positive border-positive/40' : 'text-destructive border-destructive/40',
              )}
            >
              {isBalanced ? <CheckIcon className="size-4" /> : <TriangleAlertIcon className="size-4" />}
              <span className="text-sm">
                Difference <span className="num font-semibold">{difference}</span>
              </span>
            </div>
          </div>

          <dl className="grid gap-4 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="num text-lg font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-muted-foreground text-xs">
            difference = statement balance − (beginning balance + cleared)
          </p>

          <div className="flex flex-wrap gap-2">
            {!completed && (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => setAll(true)}>
                  Tick everything
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => setAll(false)}>
                  Clear all ticks
                </Button>
                <Button size="sm" disabled={pending || !isBalanced} onClick={finish}>
                  <CheckIcon /> Finish reconciliation
                </Button>
              </>
            )}
            <Button
              variant={completed ? 'outline' : 'ghost'}
              size="sm"
              disabled={pending}
              onClick={() => setConfirmUndo(true)}
            >
              <Undo2Icon /> {completed ? 'Reopen' : 'Discard session'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-12">
                <span className="sr-only">Cleared</span>
              </TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="hidden md:table-cell">Reference</TableHead>
              <TableHead className="hidden sm:table-cell">Statement</TableHead>
              <TableHead numeric>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.lineId}>
                <TableCell>
                  <Checkbox
                    checked={line.cleared}
                    disabled={pending || completed}
                    aria-label={`Mark the ${line.date} entry of ${line.amount} as cleared`}
                    onCheckedChange={() => toggle(line)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">{line.date}</TableCell>
                <TableCell className="max-w-72 truncate">{line.description || '—'}</TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {line.reference || '—'}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {line.matched ? (
                    <Badge variant="muted">On the statement feed</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell numeric className={line.isPositive ? 'text-positive' : undefined}>
                  {line.amount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{completed ? 'Reopen this reconciliation?' : 'Discard this session?'}</DialogTitle>
            <DialogDescription>
              {completed
                ? 'The lines lose their reconciled stamp, so they can be edited or reversed again. Their cleared ticks stay, and the session goes back to in progress.'
                : 'The session is dropped. The ticks stay on the lines, because they are facts about those lines rather than about this session.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUndo(false)}>
              Cancel
            </Button>
            <Button variant={completed ? 'default' : 'destructive'} disabled={pending} onClick={undo}>
              {completed ? 'Reopen' : 'Discard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
