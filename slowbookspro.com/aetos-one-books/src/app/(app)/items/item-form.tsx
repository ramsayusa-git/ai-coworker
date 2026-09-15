'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { EntityPicker, type EntityOption } from '@/components/app/entity-picker'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { saveItem } from './actions'

export type ItemDraft = {
  name: string
  itemType: 'PRODUCT' | 'SERVICE' | 'MATERIAL' | 'LABOR'
  description: string
  rate: string
  cost: string
  incomeAccountId: number | null
  expenseAccountId: number | null
  assetAccountId: number | null
  isTaxable: boolean
  trackInventory: boolean
  reorderPoint: string
}

export const emptyItem: ItemDraft = {
  name: '',
  itemType: 'SERVICE',
  description: '',
  rate: '',
  cost: '',
  incomeAccountId: null,
  expenseAccountId: null,
  assetAccountId: null,
  isTaxable: true,
  trackInventory: false,
  reorderPoint: '',
}

const TYPE_LABELS: Record<ItemDraft['itemType'], string> = {
  PRODUCT: 'Product — something you stock and sell',
  SERVICE: 'Service — time or work you bill for',
  MATERIAL: 'Material — bought for a job, not stocked',
  LABOR: 'Labour — a charge rate for people',
}

export function ItemForm({
  id,
  initial,
  incomeAccounts,
  expenseAccounts,
  assetAccounts,
  onHand,
}: {
  id: number | null
  initial: ItemDraft
  incomeAccounts: EntityOption[]
  expenseAccounts: EntityOption[]
  assetAccounts: EntityOption[]
  /** Shown when inventory is already being tracked, so the warning is concrete. */
  onHand?: string
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveItem({ id, data: draft })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(id ? 'Item updated' : 'Item created')
      router.push(`/items/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What this item is</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor="name"
              required
              error={error?.field === 'name' ? error.message : undefined}
            >
              <Input
                id="name"
                autoFocus
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={error?.field === 'name'}
              />
            </Field>
            <Field label="Type" htmlFor="itemType">
              <Select
                value={draft.itemType}
                onValueChange={(value) => set('itemType', value as ItemDraft['itemType'])}
              >
                <SelectTrigger id="itemType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as ItemDraft['itemType'][]).map((type) => (
                    <SelectItem key={type} value={type}>{TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Description"
              htmlFor="description"
              hint="Prefilled onto every invoice line that uses this item."
              className="sm:col-span-2"
            >
              <Textarea
                id="description"
                rows={2}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <Field label="Sales price" htmlFor="rate">
              <MoneyInput id="rate" value={draft.rate} onValueChange={(value) => set('rate', value)} />
            </Field>
            <Field label="Purchase cost" htmlFor="cost" hint="A reference figure — inventory uses the weighted average.">
              <MoneyInput id="cost" value={draft.cost} onValueChange={(value) => set('cost', value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Income account" htmlFor="incomeAccountId" hint="Where a sale of this item is credited.">
              <EntityPicker
                id="incomeAccountId"
                options={incomeAccounts}
                value={draft.incomeAccountId}
                onSelect={(value) => set('incomeAccountId', value)}
                placeholder="Default sales account"
                allowClear
              />
            </Field>
            <Field label="Expense account" htmlFor="expenseAccountId">
              <EntityPicker
                id="expenseAccountId"
                options={expenseAccounts}
                value={draft.expenseAccountId}
                onSelect={(value) => set('expenseAccountId', value)}
                placeholder="Default cost of goods sold"
                allowClear
              />
            </Field>
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Charge sales tax</p>
                <p className="text-muted-foreground text-xs">
                  A tax-exempt customer still overrides this.
                </p>
              </div>
              <Switch
                checked={draft.isTaxable}
                onCheckedChange={(checked) => set('isTaxable', checked)}
                aria-label="Charge sales tax on this item"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Track quantity on hand</p>
              <p className="text-muted-foreground text-xs">
                Selling a tracked item relieves stock at its weighted-average cost and posts cost
                of goods sold. {onHand ? `Currently ${onHand} on hand.` : 'Leave off for services.'}
              </p>
            </div>
            <Switch
              checked={draft.trackInventory}
              onCheckedChange={(checked) => set('trackInventory', checked)}
              aria-label="Track quantity on hand"
            />
          </div>

          {draft.trackInventory && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inventory asset account" htmlFor="assetAccountId">
                <EntityPicker
                  id="assetAccountId"
                  options={assetAccounts}
                  value={draft.assetAccountId}
                  onSelect={(value) => set('assetAccountId', value)}
                  placeholder="Default inventory asset"
                  allowClear
                />
              </Field>
              <Field label="Reorder point" htmlFor="reorderPoint" hint="Flagged on the low-stock list at or below this.">
                <MoneyInput
                  id="reorderPoint"
                  places={4}
                  value={draft.reorderPoint}
                  onValueChange={(value) => set('reorderPoint', value)}
                />
              </Field>
              <p className="text-muted-foreground sm:col-span-2 text-xs">
                Quantity on hand and average cost are owned by the stock ledger. They change through
                purchases, sales and adjustments — never by editing this form.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <UnsavedBadge dirty={dirty} />
        <Button type="button" variant="outline" asChild>
          <Link href={id ? `/items/${id}` : '/items'}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Create item'}
        </Button>
      </div>
    </form>
  )
}
