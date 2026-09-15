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
  blankLine, documentTotals, LineItemEditor, type DocumentLine, type LineItemOption,
} from '@/components/app/line-item-editor'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import type { CustomerOption } from '../invoices/invoice-editor'
import { saveEstimate } from './actions'

export type EstimateDraft = {
  customerId: number | null
  date: string
  expirationDate: string
  taxRatePercent: string
  notes: string
  lines: DocumentLine[]
}

export const newEstimateDraft = (date: string): EstimateDraft => ({
  customerId: null,
  date,
  expirationDate: '',
  taxRatePercent: '0',
  notes: '',
  lines: [blankLine(), blankLine(), blankLine()],
})

export function EstimateEditor({
  id,
  estimateNumber,
  locked,
  initial,
  customers,
  items,
  currency,
  taxEnabled,
}: {
  id: number | null
  estimateNumber: string | null
  /** Converted estimates are history: they are shown, not edited. */
  locked: boolean
  initial: EstimateDraft
  customers: CustomerOption[]
  items: LineItemOption[]
  currency: string
  taxEnabled: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const totals = documentTotals(draft.lines, taxEnabled ? draft.taxRatePercent : '0')

  const set = <K extends keyof EstimateDraft>(key: K, value: EstimateDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveEstimate({ id, data: draft })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(id ? `${result.estimateNumber} saved` : `${result.estimateNumber} created`)
      router.push(`/estimates/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{estimateNumber ? `Estimate ${estimateNumber}` : 'New estimate'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Customer"
              htmlFor="customerId"
              required
              error={error?.field === 'customerId' ? error.message : undefined}
            >
              <EntityPicker
                id="customerId"
                options={customers.map((c) => ({ id: c.id, label: c.name, hint: c.email ?? undefined }))}
                value={draft.customerId}
                onSelect={(value) => set('customerId', value)}
                placeholder="Who is this for?"
                searchPlaceholder="Filter customers…"
                disabled={locked}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="date" required>
                <Input
                  id="date"
                  type="date"
                  value={draft.date}
                  disabled={locked}
                  onChange={(event) => set('date', event.target.value)}
                />
              </Field>
              <Field label="Expires" htmlFor="expirationDate">
                <Input
                  id="expirationDate"
                  type="date"
                  value={draft.expirationDate}
                  disabled={locked}
                  onChange={(event) => set('expirationDate', event.target.value)}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItemEditor
              lines={draft.lines}
              onChange={(lines) => set('lines', lines)}
              items={items}
              showTax={taxEnabled}
              currency={currency}
              disabled={locked}
            />
            {error?.field === 'lines' && (
              <p role="alert" className="text-destructive mt-2 text-xs">{error.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Message on the estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notes" htmlFor="notes" hint="Scope, assumptions, anything the customer should read.">
              <Textarea
                id="notes"
                rows={3}
                value={draft.notes}
                disabled={locked}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
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
                    disabled={locked}
                    onValueChange={(value) => set('taxRatePercent', value)}
                    className="h-8 w-24"
                  />
                </div>
                <Row label="Sales tax" value={formatMoney(totals.tax, currency)} />
              </>
            )}
            <Separator />
            <Row label="Total" value={formatMoney(totals.total, currency)} strong />

            <p className="text-muted-foreground text-xs">
              An estimate posts nothing. It becomes a financial event only when you convert it to an
              invoice.
            </p>

            <Separator />
            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={saving || locked}>
                <SaveIcon /> {saving ? 'Saving…' : id ? 'Save changes' : 'Create estimate'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href={id ? `/estimates/${id}` : '/estimates'}>Cancel</Link>
              </Button>
            </div>
            <div className="flex justify-center"><UnsavedBadge dirty={dirty} /></div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className={`num tabular-nums ${strong ? 'text-base font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
