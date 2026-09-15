'use client'
import { BanIcon } from 'lucide-react'
import { ConfirmAction } from '@/components/app/confirm-action'
import { voidBillAction } from '../actions'

export function BillStatusActions({ id, hasPayments }: { id: number; hasPayments: boolean }) {
  return (
    <ConfirmAction
      label="Void"
      icon={<BanIcon />}
      title="Void this bill?"
      description={
        hasPayments
          ? 'This bill has a payment or a credit applied. Void that first — the bill cannot be voided while money is sitting against it.'
          : 'The original entry stays in the journal and a reversing entry is posted against it. Any stock received is taken back out at the price it came in at.'
      }
      confirmLabel="Void it"
      successMessage="Bill voided"
      action={() => voidBillAction({ id })}
    />
  )
}
