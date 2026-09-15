'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Decimal } from 'decimal.js'
import { CheckIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { createJournalEntryAction } from './actions'

export type PickerAccount = { id: number; label: string }
export type PickerDimension = { id: number; label: string }

type Line = {
  key: number
  accountId: string
  debit: string
  credit: string
  description: string
  /** 'none' means "use the header's class/job", which is what the ledger does. */
  classId: string
  jobId: string
}

const blankLine = (key: number): Line => ({
  key,
  accountId: '',
  debit: '',
  credit: '',
  description: '',
  classId: 'none',
  jobId: 'none',
})

const dimension = (value: string) => (value === 'none' ? null : Number(value))

const toDecimal = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return new Decimal(0)
  try {
    const parsed = new Decimal(trimmed)
    return parsed.isFinite() ? parsed : new Decimal(0)
  } catch {
    return new Decimal(0)
  }
}

/**
 * A real double-entry editor: the difference is recomputed on every keystroke
 * and the entry cannot be saved until it is zero. Nothing half-balanced ever
 * reaches the ledger, and the person sees why before they try.
 */
export function JournalEditor({
  accounts,
  classes,
  jobs,
  currency,
  today,
}: {
  accounts: PickerAccount[]
  classes: PickerDimension[]
  jobs: PickerDimension[]
  currency: string
  today: string
}) {
  const router = useRouter()
  const [date, setDate] = React.useState(today)
  const [description, setDescription] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [classId, setClassId] = React.useState('none')
  const [jobId, setJobId] = React.useState('none')
  const [lines, setLines] = React.useState<Line[]>([blankLine(1), blankLine(2)])
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const nextKey = React.useRef(3)

  const patch = (key: number, change: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))

  const totals = React.useMemo(() => {
    let debit = new Decimal(0)
    let credit = new Decimal(0)
    for (const line of lines) {
      debit = debit.plus(toDecimal(line.debit))
      credit = credit.plus(toDecimal(line.credit))
    }
    return { debit, credit, difference: debit.minus(credit) }
  }, [lines])

  const valued = lines.filter(
    (line) => !toDecimal(line.debit).isZero() || !toDecimal(line.credit).isZero(),
  )
  const bothSides = lines.some(
    (line) => !toDecimal(line.debit).isZero() && !toDecimal(line.credit).isZero(),
  )
  const missingAccount = valued.some((line) => !line.accountId)
  const balanced = totals.difference.isZero() && !totals.debit.isZero()
  const canSave =
    balanced && valued.length >= 2 && !bothSides && !missingAccount && description.trim().length > 0

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await createJournalEntryAction({
        date,
        description,
        reference: reference || null,
        classId: dimension(classId),
        jobId: dimension(jobId),
        lines: valued.map((line) => ({
          accountId: Number(line.accountId),
          debit: line.debit,
          credit: line.credit,
          description: line.description || null,
          classId: dimension(line.classId),
          jobId: dimension(line.jobId),
        })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Journal entry posted')
      router.push(`/journal/${result.id}`)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) save()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="je-date">Date</Label>
          <Input
            id="je-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="je-description">Description</Label>
          <Input
            id="je-description"
            required
            value={description}
            placeholder="What this entry records"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="je-reference">Reference</Label>
          <Input
            id="je-reference"
            value={reference}
            placeholder="Optional — a check or document number"
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="je-class">Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger id="je-class">
              <SelectValue placeholder="No class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No class</SelectItem>
              {classes.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="je-job">Customer: job</Label>
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger id="je-job">
              <SelectValue placeholder="No job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No job</SelectItem>
              {jobs.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        The class and job above apply to every line. A line can override them below.
      </p>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="hidden md:table-cell">Memo</TableHead>
              <TableHead className="hidden lg:table-cell">Class and job</TableHead>
              <TableHead numeric>Debit</TableHead>
              <TableHead numeric>Credit</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={line.key}>
                <TableCell className="min-w-56">
                  <Label htmlFor={`je-account-${line.key}`} className="sr-only">
                    Account for line {index + 1}
                  </Label>
                  <Select
                    value={line.accountId}
                    onValueChange={(value) => patch(line.key, { accountId: value })}
                  >
                    <SelectTrigger id={`je-account-${line.key}`}>
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Label htmlFor={`je-memo-${line.key}`} className="sr-only">
                    Memo for line {index + 1}
                  </Label>
                  <Input
                    id={`je-memo-${line.key}`}
                    value={line.description}
                    onChange={(e) => patch(line.key, { description: e.target.value })}
                  />
                </TableCell>
                <TableCell className="hidden min-w-44 lg:table-cell">
                  <div className="space-y-1">
                    <Label htmlFor={`je-line-class-${line.key}`} className="sr-only">
                      Class for line {index + 1}
                    </Label>
                    <Select
                      value={line.classId}
                      onValueChange={(value) => patch(line.key, { classId: value })}
                    >
                      <SelectTrigger id={`je-line-class-${line.key}`}>
                        <SelectValue placeholder="Class from header" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Class from header</SelectItem>
                        {classes.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label htmlFor={`je-line-job-${line.key}`} className="sr-only">
                      Job for line {index + 1}
                    </Label>
                    <Select
                      value={line.jobId}
                      onValueChange={(value) => patch(line.key, { jobId: value })}
                    >
                      <SelectTrigger id={`je-line-job-${line.key}`}>
                        <SelectValue placeholder="Job from header" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Job from header</SelectItem>
                        {jobs.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell numeric>
                  <Label htmlFor={`je-debit-${line.key}`} className="sr-only">
                    Debit on line {index + 1}
                  </Label>
                  <Input
                    id={`je-debit-${line.key}`}
                    inputMode="decimal"
                    className="text-right"
                    value={line.debit}
                    onChange={(e) => patch(line.key, { debit: e.target.value, credit: '' })}
                  />
                </TableCell>
                <TableCell numeric>
                  <Label htmlFor={`je-credit-${line.key}`} className="sr-only">
                    Credit on line {index + 1}
                  </Label>
                  <Input
                    id={`je-credit-${line.key}`}
                    inputMode="decimal"
                    className="text-right"
                    value={line.credit}
                    onChange={(e) => patch(line.key, { credit: e.target.value, debit: '' })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length <= 2}
                    onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="hidden lg:table-cell">
                Totals
              </TableCell>
              <TableCell colSpan={2} className="hidden md:table-cell lg:hidden">
                Totals
              </TableCell>
              <TableCell className="md:hidden">Totals</TableCell>
              <TableCell numeric>{formatMoney(totals.debit, currency)}</TableCell>
              <TableCell numeric>{formatMoney(totals.credit, currency)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLines([...lines, blankLine(nextKey.current)])
            nextKey.current += 1
          }}
        >
          <PlusIcon /> Add line
        </Button>

        <div
          role="status"
          aria-live="polite"
          className={cn(
            'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
            balanced ? 'text-positive border-positive/40' : 'text-destructive border-destructive/40',
          )}
        >
          {balanced ? (
            <CheckIcon className="size-4" />
          ) : (
            <TriangleAlertIcon className="size-4" />
          )}
          {balanced
            ? 'Balanced'
            : `Out of balance by ${formatMoney(totals.difference.abs(), currency)}`}
        </div>

        <div className="flex-1" />
        <Button type="submit" disabled={!canSave || pending}>
          Post entry
        </Button>
      </div>

      {(error || bothSides || missingAccount) && (
        <p role="alert" className="text-destructive text-sm">
          {error ??
            (bothSides
              ? 'A line is either a debit or a credit, never both. Clear one side.'
              : 'Every line with an amount needs an account.')}
        </p>
      )}
    </form>
  )
}
