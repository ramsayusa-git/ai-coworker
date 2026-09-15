'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WalletIcon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EntityPicker } from '@/components/app/entity-picker'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import type { AccountOption } from '@/components/app/purchase-line-editor'
import { payBillsAction } from './actions'

/**
 * Pay bills: one vendor, one payment.
 *
 * Every open bill for the vendor is listed with its age and its balance; every
 * unapplied credit is listed beside them. Ticking a credit settles the oldest
 * bills first and costs nothing — accounts payable already moved when the
 * credit was issued — so the cash needed drops before a cent leaves the bank.
 * What is left becomes a single payment: `DR 2000 / CR the account it came
 * from`, allocated across the bills that were ticked.
 */

export type OpenBillRow = {
  id: number
  billNumber: string
  date: string
  dueDate: string | null
  ageDays: number | null
  total: string
  balanceDue: number
}

export type OpenCreditRow = {
  id: number
  creditNumber: string
  date: string
  balanceRemaining: number
}

export type VendorChoice = { id: number; name: string; openCount: number; openTotal: number }

const round = (value: number) => Math.round(value * 100) / 100
const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function ageLabel(days: number | null) {
  if (days === null) return 'No due date'
  if (days <= 0) return 'Current'
  if (days <= 30) return `${days} days`
  if (days <= 60) return '31–60 days'
  if (days <= 90) return '61–90 days'
  return 'Over 90 days'
}

export function PayBills({
  vendors,
  vendorId,
  bills,
  credits,
  accounts,
  defaultAccountId,
  today,
  currency,
  preselectedBillId,
}: {
  vendors: VendorChoice[]
  vendorId: number | null
  bills: OpenBillRow[]
  credits: OpenCreditRow[]
  accounts: AccountOption[]
  defaultAccountId: number | null
  today: string
  currency: string
  preselectedBillId: number | null
}) {
  const router = useRouter()
  const [date, setDate] = React.useState(today)
  const [payFromAccountId, setPayFromAccountId] = React.useState<number | null>(defaultAccountId)
  const [method, setMethod] = React.useState('Check')
  const [checkNumber, setCheckNumber] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [saving, startSaving] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const [amounts, setAmounts] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(
      bills
        .filter((bill) => preselectedBillId === null || bill.id === preselectedBillId)
        .map((bill) => [bill.id, bill.balanceDue.toFixed(2)]),
    ),
  )
  const [creditIds, setCreditIds] = React.useState<number[]>([])

  const ticked = bills.filter((bill) => amounts[bill.id] !== undefined)
  const tickedTotal = round(ticked.reduce((acc, bill) => acc + toNumber(amounts[bill.id] ?? '0'), 0))
  const creditTotal = round(
    credits
      .filter((credit) => creditIds.includes(credit.id))
      .reduce((acc, credit) => acc + credit.balanceRemaining, 0),
  )
  // A credit can only ever settle what is actually being paid.
  const creditApplied = Math.min(creditTotal, tickedTotal)
  const cashNeeded = round(tickedTotal - creditApplied)

  const toggleBill = (bill: OpenBillRow, checked: boolean) =>
    setAmounts((current) => {
      const next = { ...current }
      if (checked) next[bill.id] = bill.balanceDue.toFixed(2)
      else delete next[bill.id]
      return next
    })

  const selectAll = (checked: boolean) =>
    setAmounts(
      checked
        ? Object.fromEntries(bills.map((bill) => [bill.id, bill.balanceDue.toFixed(2)]))
        : {},
    )

  /**
   * Credits settle the oldest bills first, and never more than a bill still
   * owes — the same rule the server applies, worked out here so the person can
   * see it before they commit.
   */
  const creditPlan = (() => {
    const plan: { vendorCreditId: number; billId: number; amount: string }[] = []
    const remainingOnBill = new Map(ticked.map((bill) => [bill.id, toNumber(amounts[bill.id] ?? '0')]))
    for (const credit of credits.filter((c) => creditIds.includes(c.id))) {
      let left = credit.balanceRemaining
      for (const bill of ticked) {
        if (left <= 0) break
        const owed = remainingOnBill.get(bill.id) ?? 0
        if (owed <= 0) continue
        const take = round(Math.min(owed, left))
        if (take <= 0) continue
        plan.push({ vendorCreditId: credit.id, billId: bill.id, amount: take.toFixed(2) })
        remainingOnBill.set(bill.id, round(owed - take))
        left = round(left - take)
      }
    }
    return { plan, remainingOnBill }
  })()

  const cashAllocations = ticked
    .map((bill) => ({
      billId: bill.id,
      amount: (creditPlan.remainingOnBill.get(bill.id) ?? 0).toFixed(2),
    }))
    .filter((allocation) => toNumber(allocation.amount) > 0)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!vendorId) {
      setError('Choose a vendor first.')
      return
    }
    if (ticked.length === 0) {
      setError('Tick at least one bill to pay.')
      return
    }
    startSaving(async () => {
      const result = await payBillsAction({
        vendorId,
        date,
        payFromAccountId,
        method,
        checkNumber,
        notes,
        allocations: cashAllocations,
        credits: creditPlan.plan,
      })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(
        result.id ? 'Payment recorded' : 'Credits applied — no cash was needed',
      )
      router.push(result.id ? `/bill-payments/${result.id}` : '/bills')
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Who are you paying?</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Vendor"
              htmlFor="vendorId"
              required
              hint="One payment settles one vendor. Switch vendor to start again."
            >
              <EntityPicker
                id="vendorId"
                options={vendors.map((vendor) => ({
                  id: vendor.id,
                  label: vendor.name,
                  hint: `${vendor.openCount} open · ${formatMoney(vendor.openTotal, currency)}`,
                }))}
                value={vendorId}
                onSelect={(id) => router.push(id ? `/bill-payments/new?vendor=${id}` : '/bill-payments/new')}
                placeholder="Choose a vendor"
                searchPlaceholder="Filter vendors…"
                emptyLabel="No vendor has an open bill"
              />
            </Field>
            <Field label="Payment date" htmlFor="date" required>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Pay from" htmlFor="payFromAccountId" required>
              <EntityPicker
                id="payFromAccountId"
                options={accounts.map((account) => ({
                  id: account.id,
                  label: account.name,
                  hint: account.accountNumber ?? undefined,
                }))}
                value={payFromAccountId}
                onSelect={setPayFromAccountId}
                placeholder="Bank or card"
                searchPlaceholder="Filter accounts…"
                emptyLabel="No account matches"
              />
            </Field>
            <Field label="Method" htmlFor="method">
              <Input id="method" value={method} onChange={(e) => setMethod(e.target.value)} />
            </Field>
            <Field label="Check number" htmlFor="checkNumber" hint="Optional; nothing assigns one for you.">
              <Input
                id="checkNumber"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        {vendorId && (
          <Card>
            <CardHeader><CardTitle>Open bills</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {bills.length === 0 ? (
                <p className="text-muted-foreground px-5 pb-5 text-sm">
                  This vendor has nothing outstanding.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={ticked.length === bills.length && bills.length > 0}
                          onCheckedChange={(checked) => selectAll(checked === true)}
                          aria-label="Select every open bill"
                        />
                      </TableHead>
                      <TableHead>Bill</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead numeric>Total</TableHead>
                      <TableHead numeric>Open</TableHead>
                      <TableHead numeric className="w-36">Paying</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => {
                      const checked = amounts[bill.id] !== undefined
                      return (
                        <TableRow key={bill.id}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleBill(bill, value === true)}
                              aria-label={`Pay bill ${bill.billNumber}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link href={`/bills/${bill.id}`} className="underline-offset-4 hover:underline">
                              {bill.billNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{bill.dueDate ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={(bill.ageDays ?? 0) > 30 ? 'destructive' : 'muted'}>
                              {ageLabel(bill.ageDays)}
                            </Badge>
                          </TableCell>
                          <TableCell numeric>{bill.total}</TableCell>
                          <TableCell numeric>{formatMoney(bill.balanceDue, currency)}</TableCell>
                          <TableCell numeric>
                            <MoneyInput
                              value={amounts[bill.id] ?? ''}
                              disabled={!checked}
                              onValueChange={(value) =>
                                setAmounts((current) => ({ ...current, [bill.id]: value }))
                              }
                              aria-label={`Amount paying on bill ${bill.billNumber}`}
                              className="h-8"
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {vendorId && credits.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Available credits</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              <p className="text-muted-foreground px-5 pb-3 text-sm">
                A credit settles the oldest bill you have ticked first. Applying one posts nothing —
                accounts payable moved when the credit was issued.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" aria-label="Apply" />
                    <TableHead>Credit</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead numeric>Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.map((credit) => (
                    <TableRow key={credit.id}>
                      <TableCell>
                        <Checkbox
                          checked={creditIds.includes(credit.id)}
                          onCheckedChange={(checked) =>
                            setCreditIds((current) =>
                              checked === true
                                ? [...current, credit.id]
                                : current.filter((id) => id !== credit.id),
                            )
                          }
                          aria-label={`Apply credit ${credit.creditNumber}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/vendor-credits/${credit.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {credit.creditNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{credit.date}</TableCell>
                      <TableCell numeric>{formatMoney(credit.balanceRemaining, currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Field label="Memo" htmlFor="notes" hint="Kept with the payment; the vendor never sees it.">
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Bills ticked" value={String(ticked.length)} />
            <Row label="Settling" value={formatMoney(tickedTotal, currency)} />
            {creditApplied > 0 && (
              <Row label="Credits applied" value={`− ${formatMoney(creditApplied, currency)}`} muted />
            )}
            <Separator />
            <Row label="Cash needed" value={formatMoney(cashNeeded, currency)} strong />

            <Separator />

            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving || ticked.length === 0}>
                <WalletIcon /> {saving ? 'Recording…' : 'Record payment'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href="/bill-payments">Cancel</Link>
              </Button>
            </div>

            {error && (
              <p role="alert" className="text-destructive text-xs">{error}</p>
            )}
            <p className="text-muted-foreground text-xs">
              One payment per vendor: accounts payable is debited for the cash, and the account you
              pay from is credited.
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
