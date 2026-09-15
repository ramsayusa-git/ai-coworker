'use client'
import { BanIcon } from 'lucide-react'
import { ConfirmAction } from '@/components/app/confirm-action'
import { voidSpendAction } from '../actions'

export function ExpenseActions({ id, kind }: { id: number; kind: 'expense' | 'card' }) {
  return (
    <ConfirmAction
      label="Void"
      icon={<BanIcon />}
      title={kind === 'card' ? 'Void this charge?' : 'Void this expense?'}
      description="A reversing entry is posted against it. The original stays in the journal — an entry that has been ticked in a completed reconciliation cannot be voided at all."
      confirmLabel="Void it"
      successMessage={kind === 'card' ? 'Charge voided' : 'Expense voided'}
      action={() => voidSpendAction({ id })}
    />
  )
}
