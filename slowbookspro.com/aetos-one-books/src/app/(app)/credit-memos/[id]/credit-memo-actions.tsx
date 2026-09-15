'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { BanIcon, LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmAction } from '@/components/app/confirm-action'
import { EntityPicker } from '@/components/app/entity-picker'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import {
  applicableInvoices,
  applyCreditMemoAction,
  voidCreditMemoAction,
  type ApplicableInvoice,
} from '../actions'

export function CreditMemoActions({
  id,
  customerId,
  status,
  balanceRemaining,
}: {
  id: number
  customerId: number
  status: string
  balanceRemaining: string
}) {
  const voided = status === 'VOID'
  const hasCredit = Number(balanceRemaining) > 0

  return (
    <>
      {!voided && hasCredit && (
        <ApplyCreditDialog
          id={id}
          customerId={customerId}
          balanceRemaining={balanceRemaining}
        />
      )}
      {!voided && (
        <ConfirmAction
          label="Void"
          icon={<BanIcon />}
          title="Void this credit memo?"
          description="A reversing entry is posted against the original, every invoice it was applied to goes back to its previous balance, and any stock it returned goes out again."
          confirmLabel="Void it"
          successMessage="Credit memo voided"
          action={() => voidCreditMemoAction({ id })}
        />
      )}
    </>
  )
}

function ApplyCreditDialog({
  id,
  customerId,
  balanceRemaining,
}: {
  id: number
  customerId: number
  balanceRemaining: string
}) {
  const [open, setOpen] = React.useState(false)
  const [invoices, setInvoices] = React.useState<ApplicableInvoice[]>([])
  const [invoiceId, setInvoiceId] = React.useState<number | null>(null)
  const [amount, setAmount] = React.useState(balanceRemaining)
  const [loading, startLoading] = React.useTransition()
  const [pending, startTransition] = React.useTransition()

  // Load the open invoices only when the dialog is actually opened.
  React.useEffect(() => {
    if (!open) return
    startLoading(async () => setInvoices(await applicableInvoices({ customerId })))
  }, [open, customerId])

  const chosen = invoices.find((invoice) => invoice.id === invoiceId) ?? null

  const pick = (value: number | null) => {
    setInvoiceId(value)
    const invoice = invoices.find((candidate) => candidate.id === value)
    if (invoice) {
      const cap = Math.min(Number(invoice.balanceDue), Number(balanceRemaining))
      setAmount(cap.toFixed(2))
    }
  }

  const submit = () => {
    startTransition(async () => {
      const result = await applyCreditMemoAction({ memoId: id, invoiceId, amount })
      if (result.ok) {
        toast.success(`Applied to invoice ${result.invoiceNumber}`)
        setOpen(false)
        setInvoiceId(null)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LinkIcon /> Apply to an invoice
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply this credit</DialogTitle>
            <DialogDescription>
              Nothing new is posted. Accounts receivable was already credited when the memo was
              issued — this moves the credit from unapplied onto a specific invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Invoice"
              htmlFor="apply-invoice"
              className="sm:col-span-2"
              hint={
                loading
                  ? 'Loading open invoices…'
                  : invoices.length === 0
                    ? 'This customer has no open invoices to apply it to.'
                    : undefined
              }
            >
              <EntityPicker
                id="apply-invoice"
                options={invoices.map((invoice) => ({
                  id: invoice.id,
                  label: invoice.invoiceNumber,
                  hint: `${invoice.balanceDue} open`,
                  keywords: invoice.date,
                }))}
                value={invoiceId}
                onSelect={pick}
                placeholder="Choose an invoice"
                searchPlaceholder="Filter invoices…"
                emptyLabel="No open invoice"
                disabled={loading || invoices.length === 0}
              />
            </Field>

            <Field
              label="Amount"
              htmlFor="apply-amount"
              hint={
                chosen
                  ? `Up to ${Math.min(Number(chosen.balanceDue), Number(balanceRemaining)).toFixed(2)}.`
                  : `${balanceRemaining} of credit is unapplied.`
              }
            >
              <MoneyInput id="apply-amount" value={amount} onValueChange={setAmount} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || invoiceId === null}>
              {pending ? 'Applying…' : 'Apply credit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
