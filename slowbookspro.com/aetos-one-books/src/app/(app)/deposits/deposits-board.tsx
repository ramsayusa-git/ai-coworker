'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Decimal } from 'decimal.js'
import { BanknoteIcon, Undo2Icon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/app/page-header'
import { createDepositAction, voidDepositAction } from './actions'

export type PendingRow = {
  transactionLineId: number
  transactionId: number
  date: string
  description: string
  reference: string
  sourceType: string
  /** Plain decimal string, so the total is summed exactly and never as a float. */
  amount: string
  amountLabel: string
}

export type DepositListRow = {
  id: number
  date: string
  accountName: string
  amount: string
  reference: string
  voided: boolean
}

type Picker = { id: number; label: string }

/**
 * Ticking the payments that went to the bank builds the total, exactly like
 * filling in a paper deposit slip. The total stays editable, because a slip
 * occasionally carries cash that was never a recorded payment.
 */
export function DepositsBoard({
  pending,
  deposits,
  accounts,
  currency,
}: {
  pending: PendingRow[]
  deposits: DepositListRow[]
  accounts: Picker[]
  currency: string
}) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [accountId, setAccountId] = React.useState(() =>
    accounts.length === 1 ? String(accounts[0]!.id) : '',
  )
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [reference, setReference] = React.useState('')
  const [override, setOverride] = React.useState<string | null>(null)
  const [confirmVoid, setConfirmVoid] = React.useState<DepositListRow | null>(null)
  const [pendingSave, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const tickedTotal = React.useMemo(() => {
    let total = new Decimal(0)
    for (const row of pending) {
      if (selected.has(row.transactionLineId)) total = total.plus(row.amount)
    }
    return total
  }, [pending, selected])

  // The slip total follows the ticks until someone types over it.
  const total = override ?? tickedTotal.toFixed(2)
  const totalValue = (() => {
    try {
      const parsed = new Decimal(total || '0')
      return parsed.isFinite() ? parsed : new Decimal(0)
    } catch {
      return new Decimal(0)
    }
  })()

  const allTicked = pending.length > 0 && selected.size === pending.length
  const canSave = accountId !== '' && totalValue.greaterThan(0) && !pendingSave

  const toggle = (id: number) => {
    setOverride(null)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setOverride(null)
    setSelected(allTicked ? new Set() : new Set(pending.map((r) => r.transactionLineId)))
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await createDepositAction({
        depositToAccountId: Number(accountId),
        date,
        total,
        reference: reference || null,
        lineIds: [...selected],
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Deposit recorded')
      setSelected(new Set())
      setOverride(null)
      setReference('')
      router.refresh()
    })
  }

  const voidDeposit = (row: DepositListRow) =>
    startTransition(async () => {
      const result = await voidDepositAction({ id: row.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Deposit reversed')
      setConfirmVoid(null)
      router.refresh()
    })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Still in the drawer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          {pending.length === 0 ? (
            <div className="px-5 pb-6">
              <EmptyState
                title="Nothing waiting to be deposited"
                description="Payments recorded to Undeposited Funds show up here until you take them to the bank."
                icon={BanknoteIcon}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allTicked}
                        onCheckedChange={toggleAll}
                        aria-label="Select every pending payment"
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Received from</TableHead>
                    <TableHead className="hidden sm:table-cell">Reference</TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <TableRow key={row.transactionLineId}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.transactionLineId)}
                          onCheckedChange={() => toggle(row.transactionLineId)}
                          aria-label={`Include the ${row.amountLabel} payment from ${row.date}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                      <TableCell className="max-w-72 truncate">
                        <Link
                          href={`/journal/${row.transactionId}`}
                          className="hover:text-primary underline-offset-4 hover:underline"
                        >
                          {row.description || 'Payment'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {row.reference || '—'}
                      </TableCell>
                      <TableCell numeric>{row.amountLabel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>
                      {selected.size} selected
                    </TableCell>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell numeric>{formatMoney(tickedTotal, currency)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              <form
                className="space-y-4 px-5 pb-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (canSave) save()
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="deposit-account">Deposit to</Label>
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger id="deposit-account">
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
                    <Label htmlFor="deposit-date">Date</Label>
                    <Input
                      id="deposit-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deposit-reference">Reference</Label>
                    <Input
                      id="deposit-reference"
                      value={reference}
                      placeholder="Optional — the slip number"
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deposit-total">Deposit total</Label>
                    <Input
                      id="deposit-total"
                      inputMode="decimal"
                      className="text-right"
                      value={total}
                      onChange={(e) => setOverride(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-muted-foreground text-sm">
                    {formatMoney(totalValue, currency)} moves out of Undeposited Funds and into the
                    account you picked.
                  </p>
                  <div className="flex-1" />
                  <Button type="submit" disabled={!canSave}>
                    Record deposit
                  </Button>
                </div>

                {error && (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                )}
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deposits</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {deposits.length === 0 ? (
            <p className="text-muted-foreground px-5 pb-6 text-sm">
              No deposits recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Deposited to</TableHead>
                  <TableHead className="hidden sm:table-cell">Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell>
                      <Link
                        href={`/journal/${row.id}`}
                        className="hover:text-primary underline-offset-4 hover:underline"
                      >
                        {row.accountName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {row.reference || '—'}
                    </TableCell>
                    <TableCell>
                      {row.voided ? (
                        <Badge variant="muted">Reversed</Badge>
                      ) : (
                        <Badge variant="success">Recorded</Badge>
                      )}
                    </TableCell>
                    <TableCell numeric>{row.amount}</TableCell>
                    <TableCell>
                      {!row.voided && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Reverse the deposit of ${row.amount} on ${row.date}`}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmVoid !== null} onOpenChange={(open) => !open && setConfirmVoid(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse this deposit?</DialogTitle>
            <DialogDescription>
              {confirmVoid
                ? `${confirmVoid.amount} goes back into Undeposited Funds. The original entry stays in the journal with a reversing entry beside it, so the audit trail is intact.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmVoid(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pendingSave}
              onClick={() => confirmVoid && voidDeposit(confirmVoid)}
            >
              Reverse deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
