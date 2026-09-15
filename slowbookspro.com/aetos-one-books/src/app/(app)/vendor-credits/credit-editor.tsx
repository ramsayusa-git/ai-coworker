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
  type AccountOption,
  type PurchaseItemOption,
  type PurchaseLine,
} from '@/components/app/purchase-line-editor'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { saveVendorCredit } from './actions'
import type { VendorOption } from '../bills/editor-data'

export type BillChoice = { id: number; label: string; vendorId: number }

export type VendorCreditDraft = {
  vendorId: number | null
  date: string
  originalBillId: number | null
  refNumber: string
  taxRatePercent: string
  notes: string
  lines: PurchaseLine[]
}

export function VendorCreditEditor({
  initial,
  vendors,
  items,
  accounts,
  bills,
  currency,
  taxEnabled,
}: {
  initial: VendorCreditDraft
  vendors: VendorOption[]
  items: PurchaseItemOption[]
  accounts: AccountOption[]
  bills: BillChoice[]
  currency: string
  taxEnabled: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const totals = purchaseTotals(draft.lines, taxEnabled ? draft.taxRatePercent : '0')

  const set = <K extends keyof VendorCreditDraft>(key: K, value: VendorCreditDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Only the chosen vendor's bills can be cited: a credit belongs to one vendor.
  const vendorBills = bills.filter((bill) => bill.vendorId === draft.vendorId)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveVendorCredit(draft)
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(`${result.creditNumber} issued`)
      router.push(`/vendor-credits/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>New vendor credit</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Vendor"
              htmlFor="vendorId"
              required
              className="sm:col-span-2"
              error={error?.field === 'vendorId' ? error.message : undefined}
            >
              <EntityPicker
                id="vendorId"
                options={vendors.map((v) => ({ id: v.id, label: v.name, hint: v.email ?? undefined }))}
                value={draft.vendorId}
                onSelect={(vendorId) =>
                  setDraft((current) => ({ ...current, vendorId, originalBillId: null }))
                }
                placeholder="Who is crediting you?"
                searchPlaceholder="Filter vendors…"
                emptyLabel="No vendor matches"
              />
            </Field>
            <Field label="Date" htmlFor="date" required>
              <Input
                id="date"
                type="date"
                value={draft.date}
                onChange={(event) => set('date', event.target.value)}
              />
            </Field>
            <Field label="Their credit note number" htmlFor="refNumber">
              <Input
                id="refNumber"
                value={draft.refNumber}
                onChange={(event) => set('refNumber', event.target.value)}
              />
            </Field>
            <Field
              label="Against bill"
              htmlFor="originalBillId"
              className="sm:col-span-2"
              hint="For the record only — applying the credit is a separate step."
            >
              <EntityPicker
                id="originalBillId"
                options={vendorBills.map((bill) => ({ id: bill.id, label: bill.label }))}
                value={draft.originalBillId}
                onSelect={(billId) => set('originalBillId', billId)}
                placeholder={draft.vendorId ? 'Optional' : 'Choose a vendor first'}
                searchPlaceholder="Filter bills…"
                emptyLabel="No open bill from this vendor"
                allowClear
                disabled={!draft.vendorId}
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
              accounts={accounts}
              currency={currency}
            />
            {error?.field === 'lines' && (
              <p role="alert" className="text-destructive mt-2 text-xs">{error.message}</p>
            )}
            <p className="text-muted-foreground mt-2 text-xs">
              Enter the credit as a positive amount — the document is what makes it a credit. Stock
              on a line goes back out at the cost shown here, so a bill and the credit reversing it
              net to zero.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Field label="Internal notes" htmlFor="notes">
              <Textarea
                id="notes"
                rows={3}
                value={draft.notes}
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
                    onValueChange={(value) => set('taxRatePercent', value)}
                    className="h-8 w-24"
                  />
                </div>
                <Row label="Tax" value={formatMoney(totals.tax, currency)} />
              </>
            )}
            <Separator />
            <Row label="Credit total" value={formatMoney(totals.total, currency)} strong />

            <Separator />
            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving}>
                <SaveIcon /> {saving ? 'Issuing…' : 'Issue credit'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href="/vendor-credits">Cancel</Link>
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <UnsavedBadge dirty={dirty} />
            </div>

            <p className="text-muted-foreground text-xs">
              Issuing debits accounts payable and credits the expense back.
            </p>
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
