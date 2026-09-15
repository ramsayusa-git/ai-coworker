'use client'
import { BanIcon } from 'lucide-react'
import { ConfirmAction } from '@/components/app/confirm-action'
import { voidPaymentAction } from '../actions'

export function PaymentVoidAction({ id, isVoided }: { id: number; isVoided: boolean }) {
  if (isVoided) return null
  return (
    <ConfirmAction
      label="Void payment"
      icon={<BanIcon />}
      title="Void this payment?"
      description="A reversing entry is posted against the original — nothing is deleted — and every invoice this settled goes back to its previous balance."
      confirmLabel="Void it"
      successMessage="Payment voided and invoices reopened"
      action={() => voidPaymentAction({ id })}
    />
  )
}
