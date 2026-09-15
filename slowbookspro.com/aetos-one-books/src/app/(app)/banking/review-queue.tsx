'use client'
import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRightLeftIcon,
  BanIcon,
  CheckCheckIcon,
  CheckIcon,
  InboxIcon,
  LinkIcon,
  Undo2Icon,
  ZapIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/app/page-header'
import {
  acceptAllStatementLinesAction,
  acceptStatementLineAction,
  autoMatchFeedAction,
  excludeStatementLineAction,
  matchStatementLineAction,
  restoreStatementLineAction,
  setStatementCategoryAction,
  unmatchStatementLineAction,
} from './actions'

export type ReviewRow = {
  id: number
  date: string
  amountRaw: string
  amount: string
  isDeposit: boolean
  payee: string
  description: string
  checkNumber: string
  categoryAccountId: number | null
  categoryName: string | null
  matchStatus: string
  importSource: string
  suggestion: {
    lineId: number
    transactionId: number
    date: string
    daysOff: number
    description: string
    reference: string
  } | null
}

type Picker = { id: number; label: string }

const TABS = [
  { value: 'UNMATCHED', label: 'To review' },
  { value: 'AUTO', label: 'Auto-matched' },
  { value: 'MANUAL', label: 'Matched' },
  { value: 'ADDED', label: 'Added' },
  { value: 'EXCLUDED', label: 'Excluded' },
]

/**
 * The review queue. Nothing here has touched the ledger yet: a line is either
 * matched to a posting that already existed, accepted as a new posting, or
 * excluded. Auto-match offers only a single unambiguous candidate — where two
 * postings are equally close, the queue says so rather than picking one.
 */
export function ReviewQueue({
  bankAccountId,
  feedName,
  status,
  total,
  rows,
  categories,
  bankAccounts,
}: {
  bankAccountId: number
  feedName: string
  status: string
  total: number
  rows: ReviewRow[]
  categories: Picker[]
  bankAccounts: Picker[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = React.useTransition()
  const [editing, setEditing] = React.useState<ReviewRow | null>(null)
  const [editPayee, setEditPayee] = React.useState('')
  const [editMemo, setEditMemo] = React.useState('')
  const [editCategory, setEditCategory] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [batch, setBatch] = React.useState<{ added: number; skipped: { id: number; reason: string }[] } | null>(null)

  const bankIds = new Set(bankAccounts.map((a) => a.id))

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('view', 'review')
    next.set('status', value)
    router.push(`?${next.toString()}`, { scroll: false })
  }

  const run = (
    work: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await work()
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(success)
        router.refresh()
      }
    })

  const openEdit = (row: ReviewRow) => {
    setError(null)
    setEditing(row)
    setEditPayee(row.payee)
    setEditMemo(row.description)
    setEditCategory(row.categoryAccountId ? String(row.categoryAccountId) : '')
  }

  const accept = (row: ReviewRow, categoryId?: number) => {
    const category = categoryId ?? row.categoryAccountId
    if (!category) {
      toast.error('Pick a category for this line first.')
      return
    }
    run(
      () => acceptStatementLineAction({ id: row.id, categoryAccountId: category }),
      'Added to the books',
    )
  }

  const acceptEdited = () => {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await acceptStatementLineAction({
        id: editing.id,
        categoryAccountId: editCategory ? Number(editCategory) : null,
        payee: editPayee || null,
        memo: editMemo || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Added to the books')
      setEditing(null)
      router.refresh()
    })
  }

  const acceptAll = () =>
    startTransition(async () => {
      const result = await acceptAllStatementLinesAction({ bankAccountId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBatch({ added: result.added, skipped: result.skipped })
      router.refresh()
    })

  const categorised = rows.filter((row) => row.categoryAccountId !== null).length
  const isOpenQueue = status === 'UNMATCHED'

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Queue filter">
          {TABS.map((tab) => (
            <Button
              key={tab.value}
              role="tab"
              aria-selected={status === tab.value}
              variant={status === tab.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        {isOpenQueue && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await autoMatchFeedAction({ bankAccountId })
                  if (!result.ok) toast.error(result.error)
                  else {
                    toast.success(
                      result.matched === 0
                        ? 'Nothing matched unambiguously — the rest need a person'
                        : `${result.matched} line${result.matched === 1 ? '' : 's'} matched`,
                    )
                    router.refresh()
                  }
                })
              }
            >
              <ZapIcon /> Auto-match
            </Button>
            <Button size="sm" disabled={pending || categorised === 0} onClick={acceptAll}>
              <CheckCheckIcon /> Accept {categorised} categorised
            </Button>
          </>
        )}
      </div>

      <p className="text-muted-foreground text-sm">
        {feedName} · {total} line{total === 1 ? '' : 's'} in this view
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title={isOpenQueue ? 'Nothing waiting for review' : 'Nothing in this view'}
          description={
            isOpenQueue
              ? 'Import a statement, or every line has already been matched, added or excluded.'
              : 'Lines appear here once they reach this state.'
          }
          icon={InboxIcon}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Payee / description</TableHead>
                <TableHead className="hidden lg:table-cell">Suggestion</TableHead>
                <TableHead className="w-56">Category</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead className="w-64" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                  <TableCell className="max-w-64">
                    <span className="block truncate">{row.payee || row.description || '—'}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {row.description}
                      {row.checkNumber && ` · check ${row.checkNumber}`}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-56 lg:table-cell">
                    {row.suggestion ? (
                      <span className="text-muted-foreground block truncate text-xs">
                        {row.suggestion.description || `Entry #${row.suggestion.transactionId}`} ·{' '}
                        {row.suggestion.daysOff === 0
                          ? 'same day'
                          : `${row.suggestion.daysOff} day${row.suggestion.daysOff === 1 ? '' : 's'} off`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isOpenQueue ? (
                      <>
                        <Label htmlFor={`category-${row.id}`} className="sr-only">
                          Category for the {row.date} line
                        </Label>
                        <Select
                          value={row.categoryAccountId ? String(row.categoryAccountId) : ''}
                          onValueChange={(value) =>
                            run(
                              () =>
                                setStatementCategoryAction({
                                  id: row.id,
                                  categoryAccountId: Number(value),
                                }),
                              'Category set',
                            )
                          }
                        >
                          <SelectTrigger id={`category-${row.id}`}>
                            <SelectValue placeholder="Uncategorised" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={String(category.id)}>
                                {bankIds.has(category.id) ? '⇄ ' : ''}
                                {category.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {row.categoryName ?? '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    numeric
                    className={cn(row.isDeposit ? 'text-positive' : 'text-foreground')}
                  >
                    {row.amount}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      {isOpenQueue && row.suggestion && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                matchStatementLineAction({
                                  id: row.id,
                                  lineId: row.suggestion!.lineId,
                                }),
                              'Matched to the existing entry',
                            )
                          }
                        >
                          <LinkIcon /> Match
                        </Button>
                      )}
                      {isOpenQueue && (
                        <>
                          <Button
                            size="sm"
                            disabled={pending || !row.categoryAccountId}
                            onClick={() => accept(row)}
                          >
                            <CheckIcon /> Accept
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Exclude the ${row.date} line`}
                            disabled={pending}
                            onClick={() =>
                              run(() => excludeStatementLineAction({ id: row.id }), 'Excluded')
                            }
                          >
                            <BanIcon className="size-4" />
                          </Button>
                        </>
                      )}
                      {(status === 'AUTO' || status === 'MANUAL') && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => unmatchStatementLineAction({ id: row.id }),
                              'Returned to the review queue',
                            )
                          }
                        >
                          <Undo2Icon /> Unmatch
                        </Button>
                      )}
                      {status === 'EXCLUDED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => restoreStatementLineAction({ id: row.id }),
                              'Back in the review queue',
                            )
                          }
                        >
                          <Undo2Icon /> Restore
                        </Button>
                      )}
                      {status === 'ADDED' && (
                        <Badge variant="success">
                          <ArrowRightLeftIcon className="size-3" />
                          In the books
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                acceptEdited()
              }}
            >
              <DialogHeader>
                <DialogTitle>Accept this line</DialogTitle>
                <DialogDescription>
                  {editing.date} · {editing.amount}. Choosing another bank or card account as the
                  category records a transfer — which is exactly what a card payment is.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="review-category">Category</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger id="review-category">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {bankIds.has(category.id) ? '⇄ ' : ''}
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="review-payee">Payee</Label>
                <Input
                  id="review-payee"
                  value={editPayee}
                  onChange={(e) => setEditPayee(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="review-memo">Memo</Label>
                <Input
                  id="review-memo"
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !editCategory}>
                  Accept and post
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={batch !== null} onOpenChange={(open) => !open && setBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {batch?.added ?? 0} line{batch?.added === 1 ? '' : 's'} added
            </DialogTitle>
            <DialogDescription>
              {batch && batch.skipped.length > 0
                ? `${batch.skipped.length} could not be added. Each one is listed below — the rest went through.`
                : 'Every categorised line reached the ledger.'}
            </DialogDescription>
          </DialogHeader>
          {batch && batch.skipped.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {batch.skipped.map((item) => (
                <li key={item.id} className="text-muted-foreground">
                  Line #{item.id}: {item.reason}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button onClick={() => setBatch(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
