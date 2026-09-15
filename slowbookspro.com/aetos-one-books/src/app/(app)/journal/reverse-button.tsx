'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { reverseJournalEntryAction } from './actions'

/**
 * Reversal, never deletion. A posted entry stays exactly as posted; the
 * correction is a second entry with the sides swapped, so the audit trail
 * stays append-only.
 */
export function ReverseButton({
  transactionId,
  description,
  disabled,
  reason,
}: {
  transactionId: number
  description: string
  disabled?: boolean
  reason?: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const reverse = () => {
    setError(null)
    startTransition(async () => {
      const result = await reverseJournalEntryAction({ id: transactionId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Entry reversed')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        title={reason}
        onClick={() => setOpen(true)}
      >
        <Undo2Icon /> Reverse
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reverse this entry?</DialogTitle>
            <DialogDescription>
              {description} stays in the ledger. A second entry with the debits and credits swapped
              is posted on the same date, and any statement lines it cleared return to the review
              queue.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={reverse} disabled={pending}>
              Post the reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
