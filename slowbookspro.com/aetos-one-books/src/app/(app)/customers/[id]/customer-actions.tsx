'use client'
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react'
import { ConfirmAction, ActionButton } from '@/components/app/confirm-action'
import { setCustomerActiveAction } from '../actions'

export function CustomerActiveToggle({
  id,
  isActive,
  noun,
}: {
  id: number
  isActive: boolean
  noun: string
}) {
  if (!isActive) {
    return (
      <ActionButton
        label="Reactivate"
        successMessage={`This ${noun} is active again`}
        icon={<ArchiveRestoreIcon />}
        action={() => setCustomerActiveAction({ id, isActive: true })}
      />
    )
  }

  return (
    <ConfirmAction
      label="Deactivate"
      icon={<ArchiveIcon />}
      title={`Deactivate this ${noun}?`}
      description={`They stop appearing in pickers and new documents. Nothing already posted changes, and you can reactivate them at any time.`}
      confirmLabel="Deactivate"
      successMessage={`This ${noun} is now inactive`}
      action={() => setCustomerActiveAction({ id, isActive: false })}
    />
  )
}
