'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { BanIcon, HandCoinsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmAction } from '@/components/app/confirm-action'
import { EntityPicker } from '@/components/app/entity-picker'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { applyVendorCreditAction, voidVendorCreditAction } from '../actions'

export type ApplicableBill = { id: number; label: string; balanceDue: string }

export function VendorCreditActions({
  id,
  status,
  balanceRemaining,
  bills,
}: {
  id: number
  status: string
  balanceRemaining: string
  bills: ApplicableBill[]
}) {
  return (
    <>
      {status === 'ISSUED' && Number(balanceRemaining) > 0 && (
        <ApplyDialog id={id} balanceRemaining={balanceRemaining} bills={bills} />
      )}
      {status !== 'VOID' && (
        <ConfirmAction
          label="Void"
          icon={<BanIcon />}
          title="Void this credit?"
          description="Every bill it settled re-opens, a reversing entry is posted, and any stock returned comes back on hand at the cost it went out at."
          confirmLabel="Void it"
          successMessage="Vendor credit voided"
          action={() => voidVendorCreditAction({ id })}
        />
      )}
    </>
  )
}

function ApplyDialog({
  id,
  balanceRemaining,
  bills,
}: {
  id: number
  balanceRemaining: string
  bills: ApplicableBill[]
}) {
  const [open, setOpen] = React.useState(false)
  const [billId, setBillId] = React.useState<number | null>(bills[0]?.id ?? null)
  const [amount, setAmount] = React.useState(balanceRemaining)
  const [pending, startTransition] = React.useTransition()

  const bill = bills.find((candidate) => candidate.id === billId) ?? null
  const cap = bill ? Math.min(Number(bill.balanceDue), Number(balanceRemaining)) : Number(balanceRemaining)

  const pickBill = (next: number | null) => {
    setBillId(next)
    const chosen = bills.find((candidate) => candidate.id === next)
    if (chosen) {
      setAmount(Math.min(Number(chosen.balanceDue), Number(balanceRemaining)).toFixed(2))
    }
  }

  const submit = () => {
    startTransition(async () => {
      const result = await applyVendorCreditAction({ id, billId, amount })
      if (result.ok) {
        toast.success('Credit applied')
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={bills.length === 0}>
        <HandCoinsIcon /> Apply to a bill
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply this credit</DialogTitle>
            <DialogDescription>
              Nothing posts: accounts payable moved when the credit was issued. This only decides
              which bill it settles.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bill" htmlFor="apply-bill" className="sm:col-span-2">
              <EntityPicker
                id="apply-bill"
                options={bills.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.label,
                  hint: candidate.balanceDue,
                }))}
                value={billId}
                onSelect={pickBill}
                placeholder="Which bill?"
                searchPlaceholder="Filter bills…"
                emptyLabel="This vendor has no open bill"
              />
            </Field>
            <Field
              label="Amount"
              htmlFor="apply-amount"
              hint={`Up to ${cap.toFixed(2)}.`}
              className="sm:col-span-2"
            >
              <MoneyInput id="apply-amount" value={amount} onValueChange={setAmount} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || billId === null}>
              {pending ? 'Applying…' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
