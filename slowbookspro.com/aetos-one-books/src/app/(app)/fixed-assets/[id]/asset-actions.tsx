'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackageXIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { EntityPicker } from '@/components/app/entity-picker'
import type { AccountOption } from '@/components/app/purchase-line-editor'
import { disposeAssetAction } from '../actions'

export function DisposeAsset({
  id,
  assetNumber,
  bookValue,
  today,
  accounts,
  defaultAccountId,
}: {
  id: number
  assetNumber: string
  bookValue: string
  today: string
  accounts: AccountOption[]
  defaultAccountId: number | null
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [disposalDate, setDisposalDate] = React.useState(today)
  const [proceeds, setProceeds] = React.useState('0.00')
  const [depositAccountId, setDepositAccountId] = React.useState<number | null>(defaultAccountId)
  const [pending, startTransition] = React.useTransition()

  const gainLoss = Number(proceeds || 0) - Number(bookValue)

  const submit = () => {
    startTransition(async () => {
      const result = await disposeAssetAction({ id, disposalDate, proceeds, depositAccountId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        Number(result.gainLoss) === 0
          ? 'Asset disposed at book value'
          : Number(result.gainLoss) > 0
            ? `Disposed with a gain of ${result.gainLoss}`
            : `Disposed with a loss of ${Math.abs(Number(result.gainLoss)).toFixed(2)}`,
      )
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PackageXIcon /> Dispose
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispose of {assetNumber}</DialogTitle>
            <DialogDescription>
              The cost comes off the books and the depreciation taken is derecognised. Anything you
              were paid above book value is a gain; anything below is a loss.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Disposal date" htmlFor="disposal-date">
              <Input
                id="disposal-date"
                type="date"
                value={disposalDate}
                onChange={(event) => setDisposalDate(event.target.value)}
              />
            </Field>
            <Field label="Proceeds" htmlFor="disposal-proceeds" hint="Zero if it was scrapped.">
              <MoneyInput
                id="disposal-proceeds"
                value={proceeds}
                onValueChange={setProceeds}
              />
            </Field>
            <Field label="Money received into" htmlFor="disposal-account" className="sm:col-span-2">
              <EntityPicker
                id="disposal-account"
                options={accounts.map((account) => ({
                  id: account.id,
                  label: account.name,
                  hint: account.accountNumber ?? undefined,
                }))}
                value={depositAccountId}
                onSelect={setDepositAccountId}
                placeholder="Bank account"
                searchPlaceholder="Filter accounts…"
                emptyLabel="No account matches"
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-sm">
            Book value is {bookValue}, so this would post a{' '}
            {gainLoss === 0 ? 'clean disposal with no gain or loss' : gainLoss > 0 ? 'gain' : 'loss'}
            {gainLoss !== 0 ? ` of ${Math.abs(gainLoss).toFixed(2)}` : ''}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={pending}>
              {pending ? 'Posting…' : 'Dispose'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
