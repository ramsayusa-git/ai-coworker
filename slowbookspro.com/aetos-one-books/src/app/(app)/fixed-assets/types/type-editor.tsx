'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PencilIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { EntityPicker } from '@/components/app/entity-picker'
import type { AccountOption } from '@/components/app/purchase-line-editor'
import { saveAssetType } from '../actions'

export type AssetTypeDraft = {
  name: string
  description: string
  assetAccountId: number | null
  accumulatedDepreciationAccountId: number | null
  depreciationExpenseAccountId: number | null
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
  effectiveLifeYears: string
  annualRatePercent: string
}

export const emptyAssetType: AssetTypeDraft = {
  name: '',
  description: '',
  assetAccountId: null,
  accumulatedDepreciationAccountId: null,
  depreciationExpenseAccountId: null,
  depreciationMethod: 'STRAIGHT_LINE',
  effectiveLifeYears: '5',
  annualRatePercent: '20',
}

/**
 * A type carries the method, the life or rate, and the three accounts every
 * asset of that kind posts through. Leaving an account blank is fine — the
 * control accounts (1500, 1590, 6600) stand in.
 */
export function AssetTypeEditor({
  id,
  initial,
  accounts,
  trigger,
}: {
  id: number | null
  initial: AssetTypeDraft
  accounts: AccountOption[]
  trigger: 'new' | 'edit'
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const set = <K extends keyof AssetTypeDraft>(key: K, value: AssetTypeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const straightLine = draft.depreciationMethod === 'STRAIGHT_LINE'

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveAssetType({ id, data: draft })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(id ? 'Type updated' : 'Type created')
      setOpen(false)
      router.refresh()
    })
  }

  const options = accounts.map((account) => ({
    id: account.id,
    label: account.name,
    hint: account.accountNumber ?? undefined,
  }))

  return (
    <>
      {trigger === 'new' ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon /> New type
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label={`Edit ${initial.name}`}>
          <PencilIcon className="size-4" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id ? `Edit ${initial.name}` : 'New asset type'}</DialogTitle>
            <DialogDescription>
              A type sets how everything of this kind is written down and where it posts. Leave an
              account blank and the control accounts stand in.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="type-name" required className="sm:col-span-2">
              <Input
                id="type-name"
                value={draft.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="Equipment, vehicles, fit-out"
              />
            </Field>
            <Field label="Method" htmlFor="type-method">
              <Select
                value={draft.depreciationMethod}
                onValueChange={(value) =>
                  set('depreciationMethod', value as AssetTypeDraft['depreciationMethod'])
                }
              >
                <SelectTrigger id="type-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRAIGHT_LINE">Straight line</SelectItem>
                  <SelectItem value="DECLINING_BALANCE">Declining balance</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {straightLine ? (
              <Field
                label="Effective life (years)"
                htmlFor="type-life"
                required
                hint="Cost less salvage, spread evenly over this many years."
              >
                <MoneyInput
                  id="type-life"
                  value={draft.effectiveLifeYears}
                  places={2}
                  onValueChange={(value) => set('effectiveLifeYears', value)}
                />
              </Field>
            ) : (
              <Field
                label="Annual rate %"
                htmlFor="type-rate"
                required
                hint="A slice of the remaining book value each year, so early years cost more."
              >
                <MoneyInput
                  id="type-rate"
                  value={draft.annualRatePercent}
                  places={2}
                  onValueChange={(value) => set('annualRatePercent', value)}
                />
              </Field>
            )}
            <Field label="Asset account" htmlFor="type-asset" hint="Defaults to 1500 Fixed Assets.">
              <EntityPicker
                id="type-asset"
                options={options}
                value={draft.assetAccountId}
                onSelect={(value) => set('assetAccountId', value)}
                placeholder="1500 Fixed Assets"
                searchPlaceholder="Filter accounts…"
                emptyLabel="No account matches"
                allowClear
              />
            </Field>
            <Field
              label="Accumulated depreciation"
              htmlFor="type-accum"
              hint="Defaults to 1590."
            >
              <EntityPicker
                id="type-accum"
                options={options}
                value={draft.accumulatedDepreciationAccountId}
                onSelect={(value) => set('accumulatedDepreciationAccountId', value)}
                placeholder="1590 Accumulated Depreciation"
                searchPlaceholder="Filter accounts…"
                emptyLabel="No account matches"
                allowClear
              />
            </Field>
            <Field label="Depreciation expense" htmlFor="type-expense" hint="Defaults to 6600.">
              <EntityPicker
                id="type-expense"
                options={options}
                value={draft.depreciationExpenseAccountId}
                onSelect={(value) => set('depreciationExpenseAccountId', value)}
                placeholder="6600 Depreciation Expense"
                searchPlaceholder="Filter accounts…"
                emptyLabel="No account matches"
                allowClear
              />
            </Field>
            <Field label="Description" htmlFor="type-description" className="sm:col-span-2">
              <Textarea
                id="type-description"
                rows={2}
                value={draft.description}
                onChange={(event) => set('description', event.target.value)}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="text-destructive text-xs">{error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Saving…' : id ? 'Save type' : 'Create type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
