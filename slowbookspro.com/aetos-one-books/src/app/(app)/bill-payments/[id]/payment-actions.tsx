'use client'
import { BanIcon } from 'lucide-react'
import { ConfirmAction } from '@/components/app/confirm-action'
import { voidBillPaymentAction } from '../actions'

export function BillPaymentActions({ id }: { id: number }) {
  return (
    <ConfirmAction
      label="Void"
      icon={<BanIcon />}
      title="Void this payment?"
      description="A reversing entry puts the money back in the account it came from and every bill it settled re-opens for its full balance. The original entry stays in the journal."
      confirmLabel="Void it"
      successMessage="Payment voided"
      action={() => voidBillPaymentAction({ id })}
    />
  )
}
