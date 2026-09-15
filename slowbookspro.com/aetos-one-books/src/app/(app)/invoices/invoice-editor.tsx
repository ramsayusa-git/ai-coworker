'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SaveIcon, SendIcon } from 'lucide-react'
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
  blankLine, documentTotals, LineItemEditor, type DocumentLine, type LineItemOption,
} from '@/components/app/line-item-editor'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { saveInvoice, sendInvoiceAction } from './actions'

export type CustomerOption = {
  id: number
  name: string
  email: string | null
  terms: string | null
  isTaxable: boolean
}

export type InvoiceDraft = {
  customerId: number | null
  date: string
  dueDate: string
  terms: string
  poNumber: string
  taxRatePercent: string
  notes: string
  lines: DocumentLine[]
}

const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90']

/** Mirrors the server's terms parsing so the due date never surprises anyone. */
function deriveDueDate(date: string, terms: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const base = new Date(`${date}T00:00:00Z`)
  const normalised = terms.trim().toLowerCase()
  let days = 30
  if (['due on receipt', 'due upon receipt', 'cod', 'net 0'].includes(normalised)) days = 0
  else {
    const parsed = Number.parseInt(normalised.replace('net', '').trim(), 10)
    if (Number.isFinite(parsed)) days = parsed
  }
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

export function InvoiceEditor({
  id,
  invoiceNumber,
  status,
  amountPaid,
  initial,
  customers,
  items,
  currency,
  taxEnabled,
  label,
}: {
  id: number | null
  invoiceNumber: string | null
  status: string
  /** Already applied against this invoice; the editor may not go below it. */
  amountPaid: number
  initial: InvoiceDraft
  customers: CustomerOption[]
  items: LineItemOption[]
  currency: string
  taxEnabled: boolean
  label: string
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<InvoiceDraft>(initial)
  const [dueDateTouched, setDueDateTouched] = React.useState(Boolean(initial.dueDate))
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const readOnly = status === 'VOID'

  const set = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const customer = customers.find((candidate) => candidate.id === draft.customerId) ?? null
  const totals = documentTotals(draft.lines, taxEnabled ? draft.taxRatePercent : '0')
  const balance = Math.round((totals.total - amountPaid) * 100) / 100

  /** Picking a customer brings their terms with it, and the due date follows. */
  const pickCustomer = (customerId: number | null) => {
    const next = customers.find((candidate) => candidate.id === customerId)
    setDraft((current) => {
      const terms = next?.terms ?? current.terms
      return {
        ...current,
        customerId,
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
    (then: 'stay' | 'send') =>
      startSaving(async () => {
        setError(null)
        const result = await saveInvoice({ id, data: draft })
        if (!result.ok) {
          setError({ field: result.field, message: result.error })
          toast.error(result.error)
          return
        }
        if (then === 'send') {
          const sent = await sendInvoiceAction({ id: result.id })
          if (!sent.ok) {
            toast.error(sent.error)
            setSaved(true)
            router.push(`/invoices/${result.id}`)
            return
          }
        }
        setSaved(true)
        toast.success(
          then === 'send'
            ? `${result.invoiceNumber} saved and marked as sent`
            : id
              ? `${result.invoiceNumber} saved`
              : `${result.invoiceNumber} created`,
        )
        router.push(`/invoices/${result.id}`)
      }),
    [draft, id, router],
  )

  // Cmd/Ctrl+S is what people reach for in a document editor.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!readOnly && !saving) persist('stay')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [persist, readOnly, saving])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        persist('stay')
      }}
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{invoiceNumber ? `${label} ${invoiceNumber}` : `New ${label.toLowerCase()}`}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Customer"
              htmlFor="customerId"
              required
              className="sm:col-span-2"
              error={error?.field === 'customerId' ? error.message : undefined}
              hint={customer && !customer.isTaxable ? 'This customer is tax exempt.' : undefined}
            >
              <EntityPicker
                id="customerId"
                options={customers.map((c) => ({ id: c.id, label: c.name, hint: c.email ?? undefined }))}
                value={draft.customerId}
                onSelect={pickCustomer}
                placeholder="Who is this for?"
                searchPlaceholder="Filter customers…"
                emptyLabel="No customer matches"
                disabled={readOnly}
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
            <Field label="Purchase order" htmlFor="poNumber">
              <Input
                id="poNumber"
                value={draft.poNumber}
                disabled={readOnly}
                onChange={(event) => set('poNumber', event.target.value)}
                placeholder="Their reference"
              />
            </Field>
            <Field label="Terms" htmlFor="terms" className="sm:col-span-1">
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
              disabled={readOnly}
            />
            {error?.field === 'lines' && (
              <p role="alert" className="text-destructive mt-2 text-xs">{error.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Message on the invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notes" htmlFor="notes" hint="Printed at the foot of the document.">
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
                <Row
                  label="Taxable"
                  value={formatMoney(totals.taxableSubtotal, currency)}
                  muted
                />
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="taxRatePercent" className="text-muted-foreground">
                    Tax rate %
                  </label>
                  <MoneyInput
                    id="taxRatePercent"
                    places={4}
                    value={draft.taxRatePercent}
                    disabled={readOnly}
                    onValueChange={(value) => set('taxRatePercent', value)}
                    className="h-8 w-24"
                  />
                </div>
                <Row label="Sales tax" value={formatMoney(totals.tax, currency)} />
              </>
            )}
            <Separator />
            <Row label="Total" value={formatMoney(totals.total, currency)} strong />
            {amountPaid > 0 && (
              <>
                <Row label="Already paid" value={`− ${formatMoney(amountPaid, currency)}`} muted />
                <Row label="Balance due" value={formatMoney(balance, currency)} strong />
              </>
            )}

            <Separator />

            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" disabled={saving || readOnly}>
                <SaveIcon /> {saving ? 'Saving…' : id ? 'Save changes' : `Create ${label.toLowerCase()}`}
              </Button>
              {status === 'DRAFT' && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={saving || readOnly}
                  onClick={() => persist('send')}
                >
                  <SendIcon /> Save and mark as sent
                </Button>
              )}
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href={id ? `/invoices/${id}` : '/invoices'}>Cancel</Link>
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <UnsavedBadge dirty={dirty} />
            </div>

            {readOnly && (
              <p role="alert" className="text-destructive text-xs">
                This invoice is voided and cannot be changed. Duplicate it if you need a new one.
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

export const newInvoiceDraft = (date: string, terms: string): InvoiceDraft => ({
  customerId: null,
  date,
  dueDate: deriveDueDate(date, terms),
  terms,
  poNumber: '',
  taxRatePercent: '0',
  notes: '',
  lines: [blankLine(), blankLine(), blankLine()],
})
