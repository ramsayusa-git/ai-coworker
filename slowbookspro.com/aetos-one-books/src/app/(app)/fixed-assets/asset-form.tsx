'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SaveIcon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { EntityPicker } from '@/components/app/entity-picker'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { saveAsset } from './actions'

export type AssetTypeChoice = {
  id: number
  name: string
  method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
  /** Years, for straight line. */
  effectiveLifeYears: string | null
  /** A fraction a year, for declining balance. */
  annualRate: string | null
}

export type AssetDraft = {
  name: string
  assetTypeId: number | null
  purchaseDate: string
  purchasePrice: string
  salvageValue: string
  description: string
}

const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function AssetForm({
  id,
  initial,
  types,
  currency,
}: {
  id: number | null
  initial: AssetDraft
  types: AssetTypeChoice[]
  currency: string
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const type = types.find((candidate) => candidate.id === draft.assetTypeId) ?? null
  const depreciable = Math.max(0, toNumber(draft.purchasePrice) - toNumber(draft.salvageValue))

  // A first-month figure, so the shape of the schedule is visible before saving.
  const monthly = !type
    ? 0
    : type.method === 'STRAIGHT_LINE'
      ? toNumber(type.effectiveLifeYears ?? '0') > 0
        ? depreciable / (toNumber(type.effectiveLifeYears ?? '0') * 12)
        : 0
      : (toNumber(draft.purchasePrice) * toNumber(type.annualRate ?? '0')) / 12

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveAsset({ id, data: draft })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(id ? 'Asset updated' : 'Asset registered')
      router.push(`/fixed-assets/${result.id}`)
    })
  }

  const fieldError = (field: keyof AssetDraft) =>
    error?.field === field ? error.message : undefined

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <Card>
        <CardHeader><CardTitle>Asset</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={fieldError('name')} className="sm:col-span-2">
            <Input
              id="name"
              value={draft.name}
              autoFocus
              onChange={(event) => set('name', event.target.value)}
              placeholder="Delivery van, laptop, press"
            />
          </Field>
          <Field
            label="Type"
            htmlFor="assetTypeId"
            required
            error={fieldError('assetTypeId')}
            hint="The type decides the method, the life and the accounts."
          >
            <EntityPicker
              id="assetTypeId"
              options={types.map((candidate) => ({
                id: candidate.id,
                label: candidate.name,
                hint:
                  candidate.method === 'STRAIGHT_LINE'
                    ? `${candidate.effectiveLifeYears ?? '?'} yr straight line`
                    : `${((Number(candidate.annualRate ?? 0)) * 100).toFixed(1)}% declining`,
              }))}
              value={draft.assetTypeId}
              onSelect={(value) => set('assetTypeId', value)}
              placeholder="Choose a type"
              searchPlaceholder="Filter types…"
              emptyLabel="No type matches"
            />
          </Field>
          <Field label="Purchase date" htmlFor="purchaseDate" required>
            <Input
              id="purchaseDate"
              type="date"
              value={draft.purchaseDate}
              onChange={(event) => set('purchaseDate', event.target.value)}
            />
          </Field>
          <Field label="Purchase price" htmlFor="purchasePrice" required error={fieldError('purchasePrice')}>
            <MoneyInput
              id="purchasePrice"
              value={draft.purchasePrice}
              onValueChange={(value) => set('purchasePrice', value)}
            />
          </Field>
          <Field
            label="Salvage value"
            htmlFor="salvageValue"
            hint="What it will still be worth at the end. Depreciation never goes below it."
          >
            <MoneyInput
              id="salvageValue"
              value={draft.salvageValue}
              onValueChange={(value) => set('salvageValue', value)}
            />
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea
              id="description"
              rows={3}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="Serial number, location, anything worth finding later"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader><CardTitle>What this means</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Cost" value={formatMoney(toNumber(draft.purchasePrice), currency)} />
            <Row label="Salvage" value={formatMoney(toNumber(draft.salvageValue), currency)} muted />
            <Separator />
            <Row label="Depreciable" value={formatMoney(depreciable, currency)} strong />
            <Row
              label="First month"
              value={type ? formatMoney(monthly, currency) : '—'}
              muted
            />

            <Separator />
            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving}>
                <SaveIcon /> {saving ? 'Saving…' : id ? 'Save changes' : 'Register asset'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href={id ? `/fixed-assets/${id}` : '/fixed-assets'}>Cancel</Link>
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <UnsavedBadge dirty={dirty} />
            </div>

            <p className="text-muted-foreground text-xs">
              Registering posts nothing — the money moved when the bill or the expense that bought
              it was entered. Depreciation starts at the next run.
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
