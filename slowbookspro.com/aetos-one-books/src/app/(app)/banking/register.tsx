'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckIcon, PlusIcon, ShieldCheckIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/app/page-header'
import { createRegisterEntryAction, voidRegisterEntryAction } from './actions'

export type RegisterEntryRow = {
  lineId: number
  transactionId: number
  date: string
  description: string
  payee: string
  reference: string
  payment: string
  deposit: string
  balance: string
  sourceType: string
  cleared: boolean
  reconciled: boolean
  voided: boolean
  voidable: boolean
}

type Picker = { id: number; label: string }

/**
 * The register. A card shows Charge / Payment where a bank shows Payment /
 * Deposit, because a positive amount means "owe less" on a card and "have
 * more" in a bank — the underlying sign rule is identical.
 */
export function Register({
  accountId,
  accountName,
  bankKind,
  currency,
  naturalBalance,
  openingBalance,
  balance,
  entries,
  categories,
}: {
  accountId: number
  accountName: string
  bankKind: string
  currency: string
  naturalBalance: 'debit' | 'credit'
  openingBalance: string
  balance: string
  entries: RegisterEntryRow[]
  categories: Picker[]
}) {
  const router = useRouter()
  const isCard = bankKind === 'credit_card'
  const [open, setOpen] = React.useState(false)
  const [confirmVoid, setConfirmVoid] = React.useState<RegisterEntryRow | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [direction, setDirection] = React.useState<'out' | 'in'>('out')
  const [amount, setAmount] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [payee, setPayee] = React.useState('')
  const [memo, setMemo] = React.useState('')
  const [reference, setReference] = React.useState('')

  const save = () => {
    setError(null)
    const signed = direction === 'out' ? `-${amount.replace(/^-/, '')}` : amount.replace(/^-/, '')
    startTransition(async () => {
      const result = await createRegisterEntryAction({
        accountId,
        categoryAccountId: Number(categoryId),
        date,
        amount: signed,
        payee: payee || null,
        memo: memo || null,
        reference: reference || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Entry recorded')
      setOpen(false)
      setAmount('')
      setPayee('')
      setMemo('')
      setReference('')
      router.refresh()
    })
  }

  const voidEntry = (entry: RegisterEntryRow) => {
    startTransition(async () => {
      const result = await voidRegisterEntryAction({ id: entry.transactionId })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success('Entry reversed')
        setConfirmVoid(null)
        router.refresh()
      }
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{accountName} register</h2>
          <p className="text-muted-foreground text-sm">
            Opening {openingBalance} · current balance{' '}
            <span className="num font-medium">{balance}</span> ({naturalBalance}-normal, {currency})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/banking/reconcile?account=${accountId}`}>
              <ShieldCheckIcon /> Reconcile
            </Link>
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusIcon /> New entry
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing posted to this account yet"
          description="Record an entry here, or import a statement and accept the lines you recognise."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Payee / description</TableHead>
                <TableHead className="hidden lg:table-cell">Reference</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead numeric>{isCard ? 'Charge' : 'Payment'}</TableHead>
                <TableHead numeric>{isCard ? 'Payment' : 'Deposit'}</TableHead>
                <TableHead numeric>Balance</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.lineId} className={entry.voided ? 'opacity-60' : undefined}>
                  <TableCell className="whitespace-nowrap">{entry.date}</TableCell>
                  <TableCell className="max-w-72">
                    <span className="block truncate">{entry.payee || entry.description || '—'}</span>
                    {entry.payee && entry.description && entry.payee !== entry.description && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {entry.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {entry.reference || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="muted">{entry.sourceType}</Badge>
                  </TableCell>
                  <TableCell>
                    {entry.voided ? (
                      <Badge variant="destructive">Void</Badge>
                    ) : entry.reconciled ? (
                      <Badge variant="success" title="Closed by a reconciliation">
                        <ShieldCheckIcon className="size-3" />R
                      </Badge>
                    ) : entry.cleared ? (
                      <Badge variant="muted" title="A statement line has cleared this">
                        <CheckIcon className="size-3" />
                        Cleared
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Open</span>
                    )}
                  </TableCell>
                  <TableCell numeric>{entry.payment || '—'}</TableCell>
                  <TableCell numeric>{entry.deposit || '—'}</TableCell>
                  <TableCell numeric>{entry.balance}</TableCell>
                  <TableCell>
                    {entry.voidable && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Reverse the entry on ${entry.date}`}
                        onClick={() => setConfirmVoid(entry)}
                      >
                        <Undo2Icon className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>New entry in {accountName}</DialogTitle>
              <DialogDescription>
                Two sides, posted together. Choosing another bank or card account as the category
                records a transfer instead.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="entry-date">Date</Label>
                <Input
                  id="entry-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-direction">Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(value) => setDirection(value as 'out' | 'in')}
                >
                  <SelectTrigger id="entry-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="out">{isCard ? 'Charge' : 'Money out'}</SelectItem>
                    <SelectItem value="in">{isCard ? 'Payment' : 'Money in'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="entry-amount">Amount</Label>
                <Input
                  id="entry-amount"
                  inputMode="decimal"
                  required
                  value={amount}
                  placeholder="0.00"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="entry-category">
                    <SelectValue placeholder="Choose the other side" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((category) => category.id !== accountId)
                      .map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="entry-payee">Payee</Label>
                <Input id="entry-payee" value={payee} onChange={(e) => setPayee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-reference">Reference</Label>
                <Input
                  id="entry-reference"
                  value={reference}
                  placeholder="Check number"
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-memo">Memo</Label>
              <Input id="entry-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !amount || !categoryId}>
                Record entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmVoid !== null} onOpenChange={(value) => !value && setConfirmVoid(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reverse this entry?</DialogTitle>
            <DialogDescription>
              The original stays in the ledger and a reversing entry is posted alongside it. Any
              statement line it cleared returns to the review queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmVoid(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmVoid && voidEntry(confirmVoid)}
              disabled={pending}
            >
              Post the reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
