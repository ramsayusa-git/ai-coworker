'use client'
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react'
import { ActionButton, ConfirmAction } from '@/components/app/confirm-action'
import { setItemActiveAction } from '../actions'

export function ItemActiveToggle({ id, isActive }: { id: number; isActive: boolean }) {
  if (!isActive) {
    return (
      <ActionButton
        label="Reactivate"
        successMessage="This item is active again"
        icon={<ArchiveRestoreIcon />}
        action={() => setItemActiveAction({ id, isActive: true })}
      />
    )
  }

  return (
    <ConfirmAction
      label="Deactivate"
      icon={<ArchiveIcon />}
      title="Deactivate this item?"
      description="It disappears from item pickers on new documents. Everything already posted keeps its history, and you can bring the item back at any time."
      confirmLabel="Deactivate"
      successMessage="This item is now inactive"
      action={() => setItemActiveAction({ id, isActive: false })}
    />
  )
}
