'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/**
 * Warn before a half-written document is thrown away.
 *
 * Two exits need covering. Closing or reloading the tab is the browser's own
 * prompt, which is all a page can ask for there. Clicking an in-app link never
 * fires `beforeunload` at all, so that one is intercepted here and answered
 * with a real dialog rather than a system alert. Both switch off while the form
 * is saving, so a successful save navigates freely.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || anchor.target === '_blank') return
      event.preventDefault()
      event.stopPropagation()
      setPending(href)
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>
            This document has changes that have not been saved. Leaving now discards them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPending(null)}>
            Keep editing
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const href = pending
              setPending(null)
              if (href) router.push(href)
            }}
          >
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A quiet marker so the state of the form is visible, not just felt. */
export function UnsavedBadge({ dirty }: { dirty: boolean }) {
  return (
    <span className="text-muted-foreground text-xs" role="status" aria-live="polite">
      {dirty ? 'Unsaved changes' : 'All changes saved'}
    </span>
  )
}
