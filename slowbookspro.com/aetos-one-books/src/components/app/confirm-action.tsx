'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * A button whose action cannot be taken back — voiding a document, writing off
 * a balance, deactivating a record. It always asks first, in a dialog, and it
 * reports the server's own message rather than a generic failure.
 */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  successMessage,
  action,
  variant = 'outline',
  confirmVariant = 'destructive',
  size = 'sm',
  icon,
  disabled,
}: {
  label: string
  title: string
  description: string
  confirmLabel: string
  successMessage: string
  action: () => Promise<ActionResult>
  variant?: React.ComponentProps<typeof Button>['variant']
  /** The confirm button is red by default; a step that only moves work forward is not. */
  confirmVariant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  icon?: React.ReactNode
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const run = () => {
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(successMessage)
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={confirmVariant} onClick={run} disabled={pending}>
              {pending ? 'Working…' : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Same contract, without the confirmation — for reversible actions. */
export function ActionButton({
  label,
  successMessage,
  action,
  variant = 'outline',
  size = 'sm',
  icon,
  disabled,
}: {
  label: string
  successMessage: string
  action: () => Promise<ActionResult>
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  icon?: React.ReactNode
  disabled?: boolean
}) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action()
          if (result.ok) toast.success(successMessage)
          else toast.error(result.error)
        })
      }
    >
      {icon}
      {pending ? 'Working…' : label}
    </Button>
  )
}
