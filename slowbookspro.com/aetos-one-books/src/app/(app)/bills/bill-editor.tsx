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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
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
import { saveBill } from './actions'
import { deriveDueDate } from './drafts'
import type { VendorOption } from './editor-data'

export type BillDraft = {
  vendorId: number | null
  billNumber: string
  date: string
  dueDate: string
  terms: string
  refNumber: string
  taxRatePercent: string
  notes: string
  lines: PurchaseLine[]
}

const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90']

export function BillEditor({
  id,
  billNumber,
  status,
  amountPaid,
  initial,
  vendors,
  items,
  accounts,
  currency,
  taxEnabled,
}: {
  id: number | null
  billNumber: string | null
  status: string
  amountPaid: number
  initial: BillDraft
  vendors: VendorOption[]
  items: PurchaseItemOption[]
  accounts: AccountOption[]
  currency: string
  taxEnabled: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<BillDraft>(initial)
  const [dueDateTouched, setDueDateTouched] = React.useState(Boolean(initial.dueDate))
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const readOnly = status === 'VOID' || amountPaid > 0

  const set = <K extends keyof BillDraft>(key: K, value: BillDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const totals = purchaseTotals(draft.lines, taxEnabled ? draft.taxRatePercent : '0')

  /** Picking a vendor brings their terms with it, and the due date follows. */
  const pickVendor = (vendorId: number | null) => {
    const next = vendors.find((candidate) => candidate.id === vendorId)
    setDraft((current) => {
      const terms = next?.terms ?? current.terms
      return {
        ...current,
        vendorId,
        terms,
        dueDate: dueDateTouched ? current.dueDate : deriveDueDate(current.date, terms),
      }
    })
  }

  const changeDate = (date: string) =>
    setDraft((current) => ({
      ...current,
      date,
      dueDate: dueDateTouched ? current.dueDate : deriveDueDate(date, current.terms),
    }))

  const changeTerms = (terms: string) =>
    setDraft((current) => ({
      ...current,
      terms,
      dueDate: dueDateTouched ? current.dueDate : deriveDueDate(current.date, terms),
    }))

  const persist = React.useCallback(
    () =>
      startSaving(async () => {
        setError(null)
        const result = await saveBill({ id, data: draft })
        if (!result.ok) {
          setError({ field: result.field, message: result.error })
          toast.error(result.error)
          return
        }
        setSaved(true)
        toast.success(id ? `${result.billNumber} saved` : `${result.billNumber} entered`)
        router.push(`/bills/${result.id}`)
      }),
    [draft, id, router],
  )

  // Cmd/Ctrl+S is what people reach for in a document editor.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!readOnly && !saving) persist()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [persist, readOnly, saving])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        persist()
      }}
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{billNumber ? `Bill ${billNumber}` : 'New bill'}</CardTitle>
          </CardHeader>
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
                onSelect={pickVendor}
                placeholder="Who is this from?"
                searchPlaceholder="Filter vendors…"
                emptyLabel="No vendor matches"
                disabled={readOnly}
              />
            </Field>
            <Field
              label="Bill number"
              htmlFor="billNumber"
              hint="Their invoice number. Leave it blank and one is generated."
            >
              <Input
                id="billNumber"
                value={draft.billNumber}
                disabled={readOnly || Boolean(id)}
                onChange={(event) => set('billNumber', event.target.value)}
              />
            </Field>
            <Field label="Date" htmlFor="date" required error={error?.field === 'date' ? error.message : undefined}>
              <Input
                id="date"
                type="date"
                value={draft.date}
                disabled={readOnly}
                onChange={(event) => changeDate(event.target.value)}
              />
            </Field>
            <Field label="Terms" htmlFor="terms">
              <Select value={draft.terms} onValueChange={changeTerms} disabled={readOnly}>
                <SelectTrigger id="terms"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((term) => (
                    <SelectItem key={term} value={term}>{term}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Due date"
              htmlFor="dueDate"
              hint={dueDateTouched ? 'Set by hand.' : 'Follows the terms.'}
            >
              <Input
                id="dueDate"
                type="date"
                value={draft.dueDate}
                disabled={readOnly}
                onChange={(event) => {
                  setDueDateTouched(true)
                  set('dueDate', event.target.value)
                }}
              />
            </Field>
            <Field label="Reference" htmlFor="refNumber" className="sm:col-span-2">
              <Input
                id="refNumber"
                value={draft.refNumber}
                disabled={readOnly}
                onChange={(event) => set('refNumber', event.target.value)}
                placeholder="Statement or order reference"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <PurchaseLineEditor
              lines={draft.lines}
              onChange={(lines) => set('lines', lines)}
              items={items}
              accounts={accounts}
              currency={currency}
              disabled={readOnly}
            />
            {error?.field === 'lines' && (
              <p role="alert" className="text-destructive mt-2 text-xs">{error.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Internal notes" htmlFor="notes" hint="For your records; the vendor never sees this.">
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
            {amountPaid > 0 && (
              <Row label="Already settled" value={formatMoney(amountPaid, currency)} muted />
            )}

            <Separator />

            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving || readOnly}>
                <SaveIcon /> {saving ? 'Saving…' : id ? 'Save changes' : 'Enter bill'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href={id ? `/bills/${id}` : '/bills'}>Cancel</Link>
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <UnsavedBadge dirty={dirty} />
            </div>

            {status === 'VOID' && (
              <p role="alert" className="text-destructive text-xs">
                This bill is voided and cannot be changed. Enter a new one instead.
              </p>
            )}
            {status !== 'VOID' && amountPaid > 0 && (
              <p role="alert" className="text-destructive text-xs">
                Money has been applied to this bill. Void the payment or the credit first, then edit it.
              </p>
            )}
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
