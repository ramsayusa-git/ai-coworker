'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SaveIcon, WandSparklesIcon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { EntityPicker } from '@/components/app/entity-picker'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { openInvoicesForCustomer, savePayment, type OpenInvoiceOption } from './actions'

export type PayerOption = { id: number; name: string; email: string | null }
export type DepositAccountOption = { id: number; name: string; accountNumber: string | null }

const METHODS = ['Check', 'Cash', 'Bank transfer', 'Credit card', 'Other'] as const

const round = (value: number) => Math.round(value * 100) / 100
const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Receiving money against open invoices.
 *
 * The rule the form exists to make obvious: the payment relieves accounts
 * receivable in full, whether or not every cent is matched to an invoice. What
 * is left over is an unapplied credit sitting on the customer, and the summary
 * says so in words rather than leaving the person to work it out.
 */
export function PaymentForm({
  customers,
  depositAccounts,
  undepositedAccountId,
  initialCustomerId,
  initialInvoiceIds,
  today,
  currency,
}: {
  customers: PayerOption[]
  depositAccounts: DepositAccountOption[]
  undepositedAccountId: number | null
  initialCustomerId: number | null
  initialInvoiceIds: number[]
  today: string
  currency: string
}) {
  const router = useRouter()

  const [customerId, setCustomerId] = React.useState<number | null>(initialCustomerId)
  const [date, setDate] = React.useState(today)
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState<string>('Check')
  const [checkNumber, setCheckNumber] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [depositTo, setDepositTo] = React.useState<number | null>(undepositedAccountId)
  const [notes, setNotes] = React.useState('')

  const [invoices, setInvoices] = React.useState<OpenInvoiceOption[]>([])
  const [applied, setApplied] = React.useState<Record<number, string>>({})
  const [loadingInvoices, startLoading] = React.useTransition()
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  /** A customer change drops the previous customer's grid rather than carrying it over. */
  const pickCustomer = (value: number | null) => {
    setCustomerId(value)
    setInvoices([])
    setApplied({})
  }

  // Open invoices follow the chosen customer.
  React.useEffect(() => {
    if (customerId == null) return
    startLoading(async () => {
      const rows = await openInvoicesForCustomer({ customerId })
      setInvoices(rows)
      setApplied((current) => {
        const next: Record<number, string> = {}
        for (const row of rows) {
          if (current[row.id]) next[row.id] = current[row.id]
          else if (initialInvoiceIds.includes(row.id)) next[row.id] = row.balanceDue
        }
        return next
      })
    })
  }, [customerId, initialInvoiceIds])

  const paymentAmount = round(toNumber(amount))
  const appliedTotal = round(
    invoices.reduce((total, invoice) => total + toNumber(applied[invoice.id] ?? ''), 0),
  )
  const unapplied = round(paymentAmount - appliedTotal)
  const overApplied = unapplied < 0

  const dirty =
    !saved &&
    (paymentAmount > 0 || appliedTotal > 0 || notes !== '' || reference !== '' || checkNumber !== '')

  const setLine = (invoiceId: number, value: string) =>
    setApplied((current) => ({ ...current, [invoiceId]: value }))

  /** Fill the grid oldest first, up to whatever was actually received. */
  const applyOldestFirst = () => {
    let left = paymentAmount > 0 ? paymentAmount : Number.POSITIVE_INFINITY
    const next: Record<number, string> = {}
    for (const invoice of invoices) {
      if (left <= 0) break
      const take = round(Math.min(toNumber(invoice.balanceDue), left))
      if (take <= 0) continue
      next[invoice.id] = take.toFixed(2)
      left = round(left - take)
    }
    setApplied(next)
    if (paymentAmount <= 0) {
      const total = round(
        Object.values(next).reduce((sum, value) => sum + toNumber(value), 0),
      )
      setAmount(total.toFixed(2))
    }
  }

  const clearApplied = () => setApplied({})

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (overApplied) {
      setError({ field: 'amount', message: 'You have applied more than you received.' })
      return
    }
    startSaving(async () => {
      const result = await savePayment({
        customerId,
        date,
        amount,
        method,
        checkNumber,
        reference,
        depositToAccountId: depositTo,
        notes,
        allocations: invoices
          .map((invoice) => ({ invoiceId: invoice.id, amount: applied[invoice.id] ?? '0' }))
          .filter((line) => toNumber(line.amount) > 0),
      })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(
        Number(result.unapplied) > 0
          ? `Payment recorded — ${formatMoney(result.unapplied, currency)} left as an unapplied credit`
          : 'Payment recorded and applied',
      )
      router.push(`/payments/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Payment received</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Customer"
              htmlFor="customerId"
              required
              className="lg:col-span-2"
              error={error?.field === 'customerId' ? error.message : undefined}
            >
              <EntityPicker
                id="customerId"
                options={customers.map((c) => ({
                  id: c.id,
                  label: c.name,
                  hint: c.email ?? undefined,
                }))}
                value={customerId}
                onSelect={pickCustomer}
                placeholder="Who paid?"
                searchPlaceholder="Filter customers…"
                emptyLabel="No customer matches"
              />
            </Field>

            <Field
              label="Date"
              htmlFor="date"
              required
              error={error?.field === 'date' ? error.message : undefined}
            >
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>

            <Field
              label="Amount received"
              htmlFor="amount"
              required
              error={error?.field === 'amount' ? error.message : undefined}
            >
              <MoneyInput id="amount" value={amount} onValueChange={setAmount} placeholder="0.00" />
            </Field>

            <Field label="Method" htmlFor="method">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Deposit to"
              htmlFor="depositTo"
              hint="Undeposited funds holds it until you make the deposit."
            >
              <Select
                value={depositTo === null ? '' : String(depositTo)}
                onValueChange={(value) => setDepositTo(Number.parseInt(value, 10))}
              >
                <SelectTrigger id="depositTo">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {depositAccounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.accountNumber ? `${account.accountNumber} · ` : ''}
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {method === 'Check' ? (
              <Field label="Check number" htmlFor="checkNumber">
                <Input
                  id="checkNumber"
                  value={checkNumber}
                  onChange={(event) => setCheckNumber(event.target.value)}
                  placeholder="1042"
                />
              </Field>
            ) : (
              <Field label="Reference" htmlFor="reference" hint="Transaction or confirmation id.">
                <Input
                  id="reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Apply to invoices</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyOldestFirst}
                disabled={invoices.length === 0}
              >
                <WandSparklesIcon /> Apply oldest first
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearApplied}
                disabled={appliedTotal === 0}
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {customerId == null ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Choose a customer to see what they owe.
              </p>
            ) : loadingInvoices ? (
              <p className="text-muted-foreground py-6 text-center text-sm" role="status">
                Loading open invoices…
              </p>
            ) : invoices.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                This customer has nothing outstanding. Recording the payment anyway leaves it as an
                unapplied credit you can apply later.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-2xl text-sm">
                  <caption className="sr-only">
                    Open invoices for this customer, with the amount to apply to each.
                  </caption>
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="border-b">
                      <th scope="col" className="px-3 py-2 text-left font-medium">Invoice</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Due</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Open</th>
                      <th scope="col" className="w-36 px-3 py-2 text-right font-medium">Apply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => {
                      const over =
                        toNumber(applied[invoice.id] ?? '') > toNumber(invoice.balanceDue) + 0.0001
                      return (
                        <tr key={invoice.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-medium">
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {invoice.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{invoice.date}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{invoice.dueDate ?? '—'}</td>
                          <td className="num px-3 py-1.5 text-right tabular-nums">
                            {formatMoney(invoice.total, currency)}
                          </td>
                          <td className="num px-3 py-1.5 text-right tabular-nums">
                            {formatMoney(invoice.balanceDue, currency)}
                          </td>
                          <td className="px-3 py-1.5">
                            <MoneyInput
                              value={applied[invoice.id] ?? ''}
                              onValueChange={(value) => setLine(invoice.id, value)}
                              aria-label={`Amount to apply to invoice ${invoice.invoiceNumber}`}
                              aria-invalid={over || undefined}
                              className={`h-8 ${over ? 'border-destructive' : ''}`}
                              placeholder="0.00"
                            />
                            {over && (
                              <p role="alert" className="text-destructive mt-1 text-xs">
                                More than this invoice has open.
                              </p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Internal note</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notes" htmlFor="notes" hint="Not shown to the customer.">
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Received" value={formatMoney(paymentAmount, currency)} strong />
            <Row label="Applied to invoices" value={formatMoney(appliedTotal, currency)} />
            <Separator />
            <Row
              label={overApplied ? 'Over-applied' : 'Left unapplied'}
              value={formatMoney(Math.abs(unapplied), currency)}
              tone={overApplied ? 'negative' : undefined}
              strong
            />

            {overApplied ? (
              <p role="alert" className="text-destructive text-xs">
                You have applied more than you received. Lower a line or raise the amount.
              </p>
            ) : unapplied > 0 ? (
              <p className="text-muted-foreground text-xs">
                The full payment still relieves accounts receivable. The unapplied part sits as a
                credit on this customer until you apply it.
              </p>
            ) : null}

            <Separator />

            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving || overApplied}>
                <SaveIcon /> {saving ? 'Recording…' : 'Record payment'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href="/payments">Cancel</Link>
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <UnsavedBadge dirty={dirty} />
            </div>
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
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'negative'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span
        className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''} ${
          tone === 'negative' ? 'text-destructive' : ''
        }`}
      >
        {value}
      </span>
    </div>
  )
}
