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
import {
  PurchaseLineEditor,
  purchaseTotals,
  type PurchaseItemOption,
  type PurchaseLine,
} from '@/components/app/purchase-line-editor'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { savePurchaseOrder } from './actions'
import type { VendorOption } from '../bills/editor-data'

export type PurchaseOrderDraft = {
  vendorId: number | null
  date: string
  expectedDate: string
  shipTo: string
  taxRatePercent: string
  notes: string
  lines: PurchaseLine[]
}

export function PurchaseOrderEditor({
  id,
  poNumber,
  status,
  initial,
  vendors,
  items,
  currency,
  taxEnabled,
}: {
  id: number | null
  poNumber: string | null
  status: string
  initial: PurchaseOrderDraft
  vendors: VendorOption[]
  items: PurchaseItemOption[]
  currency: string
  taxEnabled: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const readOnly = status === 'CLOSED'
  const totals = purchaseTotals(draft.lines, taxEnabled ? draft.taxRatePercent : '0')

  const set = <K extends keyof PurchaseOrderDraft>(key: K, value: PurchaseOrderDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await savePurchaseOrder({ id, data: draft })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(id ? `${result.poNumber} saved` : `${result.poNumber} created`)
      router.push(`/purchase-orders/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{poNumber ? `Purchase order ${poNumber}` : 'New purchase order'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Vendor"
              htmlFor="vendorId"
              required
              error={error?.field === 'vendorId' ? error.message : undefined}
            >
              <EntityPicker
                id="vendorId"
                options={vendors.map((v) => ({ id: v.id, label: v.name, hint: v.email ?? undefined }))}
                value={draft.vendorId}
                onSelect={(vendorId) => set('vendorId', vendorId)}
                placeholder="Who are you ordering from?"
                searchPlaceholder="Filter vendors…"
                emptyLabel="No vendor matches"
                disabled={readOnly}
              />
            </Field>
            <Field label="Date" htmlFor="date" required>
              <Input
                id="date"
                type="date"
                value={draft.date}
                disabled={readOnly}
                onChange={(event) => set('date', event.target.value)}
              />
            </Field>
            <Field label="Expected" htmlFor="expectedDate" hint="When you expect it to arrive.">
              <Input
                id="expectedDate"
                type="date"
                value={draft.expectedDate}
                disabled={readOnly}
                onChange={(event) => set('expectedDate', event.target.value)}
              />
            </Field>
            <Field label="Ship to" htmlFor="shipTo" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                id="shipTo"
                rows={2}
                value={draft.shipTo}
                disabled={readOnly}
                onChange={(event) => set('shipTo', event.target.value)}
                placeholder="Where the goods should go"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
          <CardContent>
            <PurchaseLineEditor
              lines={draft.lines}
              onChange={(lines) => set('lines', lines)}
              items={items}
              accounts={[]}
              showAccount={false}
              currency={currency}
              disabled={readOnly}
            />
            {error?.field === 'lines' && (
              <p role="alert" className="text-destructive mt-2 text-xs">{error.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Field label="Notes" htmlFor="notes" hint="Printed on the order you send the vendor.">
              <Textarea
                id="notes"
                rows={3}
                value={draft.notes}
                disabled={readOnly}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
            {taxEnabled && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="taxRatePercent" className="text-muted-foreground">Tax rate %</label>
                  <MoneyInput
                    id="taxRatePercent"
                    places={4}
                    value={draft.taxRatePercent}
                    disabled={readOnly}
                    onValueChange={(value) => set('taxRatePercent', value)}
                    className="h-8 w-24"
                  />
                </div>
                <Row label="Tax" value={formatMoney(totals.tax, currency)} />
              </>
            )}
            <Separator />
            <Row label="Total" value={formatMoney(totals.total, currency)} strong />

            <Separator />
            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving || readOnly}>
                <SaveIcon /> {saving ? 'Saving…' : id ? 'Save changes' : 'Create order'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href={id ? `/purchase-orders/${id}` : '/purchase-orders'}>Cancel</Link>
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <UnsavedBadge dirty={dirty} />
            </div>

            <p className="text-muted-foreground text-xs">
              Nothing posts from an order. The ledger moves when you turn it into a bill.
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
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
