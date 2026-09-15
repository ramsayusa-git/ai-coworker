'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeftRightIcon, PlusIcon, Undo2Icon } from 'lucide-react'
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
import { createTransferAction, voidTransferAction } from './actions'

export type TransferListRow = {
  id: number
  date: string
  fromAccountName: string
  toAccountName: string
  amount: string
  memo: string
  reference: string
  voided: boolean
}

type Picker = { id: number; label: string }

/**
 * A transfer is one journal entry with two bank-side lines. It is not a payment
 * and not income — which is why it lives here rather than being categorised in
 * the register.
 */
export function TransfersBoard({
  rows,
  accounts,
}: {
  rows: TransferListRow[]
  accounts: Picker[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [confirmVoid, setConfirmVoid] = React.useState<TransferListRow | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [fromId, setFromId] = React.useState('')
  const [toId, setToId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [memo, setMemo] = React.useState('')
  const [reference, setReference] = React.useState('')

  const sameAccount = fromId !== '' && fromId === toId

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await createTransferAction({
        date,
        fromAccountId: Number(fromId),
        toAccountId: Number(toId),
        amount,
        memo: memo || null,
        reference: reference || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Transfer recorded')
      setOpen(false)
      setAmount('')
      setMemo('')
      setReference('')
      router.refresh()
    })
  }

  const voidTransfer = (row: TransferListRow) =>
    startTransition(async () => {
      const result = await voidTransferAction({ id: row.id })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success('Transfer reversed')
        setConfirmVoid(null)
        router.refresh()
      }
    })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} disabled={accounts.length < 2}>
          <PlusIcon /> New transfer
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Move money between your own accounts — a bank to a savings account, or a bank to a credit card to pay it off."
          icon={ArrowLeftRightIcon}
          action={
            accounts.length >= 2 ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                Record a transfer
              </Button>
            ) : (
              <p className="text-muted-foreground text-sm">
                You need at least two bank or card accounts first.
              </p>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="hidden md:table-cell">Memo</TableHead>
                <TableHead className="hidden lg:table-cell">Reference</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className={row.voided ? 'opacity-60' : undefined}>
                  <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                  <TableCell>{row.fromAccountName}</TableCell>
                  <TableCell>{row.toAccountName}</TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-56 truncate md:table-cell">
                    {row.memo || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {row.reference || '—'}
                  </TableCell>
                  <TableCell numeric>{row.amount}</TableCell>
                  <TableCell>
                    {row.voided ? (
                      <Badge variant="destructive">Void</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Reverse the transfer on ${row.date}`}
                        onClick={() => setConfirmVoid(row)}
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
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <DialogHeader>
              <DialogTitle>New transfer</DialogTitle>
              <DialogDescription>
                One entry, two bank lines: the receiving account is debited and the sending account
                is credited.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-date">Date</Label>
                <Input
                  id="transfer-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-amount">Amount</Label>
                <Input
                  id="transfer-amount"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-from">From</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger id="transfer-from">
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-to">To</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger id="transfer-to" aria-invalid={sameAccount}>
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
                {sameAccount && (
                  <p role="alert" className="text-destructive text-xs">
                    A transfer needs two different accounts.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-memo">Memo</Label>
                <Input id="transfer-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-reference">Reference</Label>
                <Input
                  id="transfer-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
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
              <Button type="submit" disabled={pending || sameAccount || !fromId || !toId || !amount}>
                Record transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmVoid !== null} onOpenChange={(value) => !value && setConfirmVoid(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reverse this transfer?</DialogTitle>
            <DialogDescription>
              The original stays in the ledger and a reversing entry is posted alongside it. Any
              statement line it cleared returns to the review queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmVoid(null)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => confirmVoid && voidTransfer(confirmVoid)}>
              Post the reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
