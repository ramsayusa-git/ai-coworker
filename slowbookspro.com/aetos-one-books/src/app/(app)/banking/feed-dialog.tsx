'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { createFeedAction } from './actions'

/**
 * A feed is the statement identity for a ledger account — it holds nothing but
 * the bank's name, the last four digits and the imported lines. The balance
 * always comes from the ledger, never from here.
 */
export function FeedDialog({
  accountId,
  accountName,
}: {
  accountId: number
  accountName: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(accountName)
  const [bankName, setBankName] = React.useState('')
  const [lastFour, setLastFour] = React.useState('')
  const [openingBalance, setOpeningBalance] = React.useState('')
  const [openingDate, setOpeningDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await createFeedAction({
        name,
        accountId,
        bankName: bankName || null,
        lastFour: lastFour || null,
        openingBalance: openingBalance || null,
        openingDate: openingBalance ? openingDate : null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Feed added')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> Add a feed
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a statement feed</DialogTitle>
              <DialogDescription>
                Statements imported into this feed post against {accountName}. An opening balance
                is optional and goes to Opening Balance Equity.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="feed-name">Feed name</Label>
              <Input
                id="feed-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="feed-bank">Bank</Label>
                <Input
                  id="feed-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feed-last-four">Last four digits</Label>
                <Input
                  id="feed-last-four"
                  maxLength={4}
                  inputMode="numeric"
                  value={lastFour}
                  onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="feed-opening">Opening balance</Label>
                <Input
                  id="feed-opening"
                  inputMode="decimal"
                  placeholder="Leave blank if the ledger is already right"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feed-opening-date">As of</Label>
                <Input
                  id="feed-opening-date"
                  type="date"
                  disabled={!openingBalance}
                  value={openingDate}
                  onChange={(e) => setOpeningDate(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Add feed
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
