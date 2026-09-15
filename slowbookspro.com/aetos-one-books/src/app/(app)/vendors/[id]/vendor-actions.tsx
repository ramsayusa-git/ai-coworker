'use client'
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react'
import { ConfirmAction } from '@/components/app/confirm-action'
import { setVendorActiveAction } from '../actions'

export function VendorStatusActions({ id, isActive }: { id: number; isActive: boolean }) {
  return isActive ? (
    <ConfirmAction
      label="Deactivate"
      icon={<ArchiveIcon />}
      title="Deactivate this vendor?"
      description="They stop appearing in pickers. Their bills, payments and history stay exactly as they are — nothing is deleted."
      confirmLabel="Deactivate"
      successMessage="Vendor deactivated"
      action={() => setVendorActiveAction({ id, isActive: false })}
    />
  ) : (
    <ConfirmAction
      label="Reactivate"
      icon={<ArchiveRestoreIcon />}
      title="Bring this vendor back?"
      description="They will appear in pickers again and can be billed."
      confirmLabel="Reactivate"
      confirmVariant="default"
      successMessage="Vendor reactivated"
      action={() => setVendorActiveAction({ id, isActive: true })}
    />
  )
}
