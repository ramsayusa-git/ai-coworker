'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BanIcon, CopyIcon, ScrollTextIcon, SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ActionButton, ConfirmAction } from '@/components/app/confirm-action'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import {
  duplicateInvoiceAction,
  sendInvoiceAction,
  voidInvoiceAction,
  writeOffInvoiceAction,
} from '../actions'

export function InvoiceStatusActions({
  id,
  status,
  hasPayments,
  balanceDue,
  today,
  label,
}: {
  id: number
  status: string
  hasPayments: boolean
  balanceDue: string
  today: string
  label: string
}) {
  const router = useRouter()

  return (
    <>
      {status === 'DRAFT' && (
        <ActionButton
          label="Mark as sent"
          icon={<SendIcon />}
          successMessage={`${label} marked as sent`}
          action={() => sendInvoiceAction({ id })}
        />
      )}

      <ActionButton
        label="Duplicate"
        icon={<CopyIcon />}
        successMessage="Copy created as a draft"
        action={async () => {
          const result = await duplicateInvoiceAction({ id })
          if (result.ok) router.push(`/invoices/${result.id}`)
          return result
        }}
      />

      {status !== 'VOID' && Number(balanceDue) > 0 && (
        <WriteOffDialog id={id} balanceDue={balanceDue} today={today} label={label} />
      )}

      {status !== 'VOID' && (
        <ConfirmAction
          label="Void"
          icon={<BanIcon />}
          title={`Void this ${label.toLowerCase()}?`}
          description={
            hasPayments
              ? 'This invoice has payments applied. Void the payment first — the invoice cannot be voided while money is sitting against it.'
              : 'The original entry stays in the journal and a reversing entry is posted against it. Any stock sold is put back at the cost it left at.'
          }
          confirmLabel="Void it"
          successMessage={`${label} voided`}
          action={() => voidInvoiceAction({ id })}
        />
      )}
    </>
  )
}

function WriteOffDialog({
  id,
  balanceDue,
  today,
  label,
}: {
  id: number
  balanceDue: string
  today: string
  label: string
}) {
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState(balanceDue)
  const [date, setDate] = React.useState(today)
  const [memo, setMemo] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const submit = () => {
    startTransition(async () => {
      const result = await writeOffInvoiceAction({ id, date, amount, memo })
      if (result.ok) {
        toast.success('Written off to bad debt')
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScrollTextIcon /> Write off
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write off this balance</DialogTitle>
            <DialogDescription>
              A credit memo is issued against bad debt expense and applied to this{' '}
              {label.toLowerCase()} straight away. The receivable comes off the books; the document
              stays.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="write-off-amount" hint={`Up to ${balanceDue}.`}>
              <MoneyInput id="write-off-amount" value={amount} onValueChange={setAmount} />
            </Field>
            <Field label="Date" htmlFor="write-off-date">
              <Input
                id="write-off-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Reason" htmlFor="write-off-memo" className="sm:col-span-2">
              <Textarea
                id="write-off-memo"
                rows={2}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Uncollectable after three reminders"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Writing off…' : 'Write off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
