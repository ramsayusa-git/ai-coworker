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
import { issueCreditMemoAction } from './actions'

export type CreditMemoDraft = {
  customerId: number | null
  date: string
  originalInvoiceId: number | null
  taxRatePercent: string
  notes: string
  lines: DocumentLine[]
}

export type CreditableInvoice = {
  id: number
  invoiceNumber: string
  customerId: number
  total: string
}

export const newCreditMemoDraft = (date: string): CreditMemoDraft => ({
  customerId: null,
  date,
  originalInvoiceId: null,
  taxRatePercent: '0',
  notes: '',
  lines: [blankLine(), blankLine()],
})

/**
 * Issuing a credit memo. There is no edit: the memo posts the moment it is
 * issued, so a mistake is voided and reissued rather than rewritten — which is
 * why this editor only ever creates.
 */
export function CreditMemoEditor({
  initial,
  customers,
  items,
  invoices,
  currency,
  taxEnabled,
}: {
  initial: CreditMemoDraft
  customers: CustomerOption[]
  items: LineItemOption[]
  /** Recent invoices the credit can be tied back to, for the paper trail. */
  invoices: CreditableInvoice[]
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

  const set = <K extends keyof CreditMemoDraft>(key: K, value: CreditMemoDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const related = invoices.filter(
    (invoice) => draft.customerId === null || invoice.customerId === draft.customerId,
  )

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await issueCreditMemoAction(draft)
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(`${result.memoNumber} issued`)
      router.push(`/credit-memos/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>New credit memo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Customer"
              htmlFor="customerId"
              required
              error={error?.field === 'customerId' ? error.message : undefined}
            >
              <EntityPicker
                id="customerId"
                options={customers.map((c) => ({
                  id: c.id,
                  label: c.name,
                  hint: c.email ?? undefined,
                }))}
                value={draft.customerId}
                onSelect={(value) =>
                  setDraft((current) => ({
                    ...current,
                    customerId: value,
                    // A credit belongs to one customer; a stale invoice link would
                    // point at somebody else's document.
                    originalInvoiceId: null,
                  }))
                }
                placeholder="Who is being credited?"
                searchPlaceholder="Filter customers…"
              />
            </Field>

            <Field
              label="Date"
              htmlFor="date"
              required
              error={error?.field === 'date' ? error.message : undefined}
            >
              <Input
                id="date"
                type="date"
                value={draft.date}
                onChange={(event) => set('date', event.target.value)}
              />
            </Field>

            <Field
              label="Against invoice"
              htmlFor="originalInvoiceId"
              hint="Optional — records what the credit relates to."
            >
              <EntityPicker
                id="originalInvoiceId"
                options={related.map((invoice) => ({
                  id: invoice.id,
                  label: invoice.invoiceNumber,
                  hint: formatMoney(invoice.total, currency),
                }))}
                value={draft.originalInvoiceId}
                onSelect={(value) => set('originalInvoiceId', value)}
                placeholder="None"
                searchPlaceholder="Filter invoices…"
                emptyLabel="No invoice matches"
                allowClear
                disabled={draft.customerId === null}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What is being credited</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItemEditor
              lines={draft.lines}
              onChange={(lines) => set('lines', lines)}
              items={items}
              showTax={false}
              currency={currency}
            />
            {error?.field === 'lines' && (
              <p role="alert" className="text-destructive mt-2 text-xs">
                {error.message}
              </p>
            )}
            <p className="text-muted-foreground mt-2 text-xs">
              Enter positive amounts — a credit memo is already the other way round. Tracked stock
              on these lines comes back on hand at its current average cost.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notes" htmlFor="notes" hint="Why the credit was given.">
              <Textarea
                id="notes"
                rows={2}
                value={draft.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Damaged in transit — two units returned"
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
                  <label htmlFor="taxRatePercent" className="text-muted-foreground">
                    Tax rate %
                  </label>
                  <MoneyInput
                    id="taxRatePercent"
                    places={4}
                    value={draft.taxRatePercent}
                    onValueChange={(value) => set('taxRatePercent', value)}
                    className="h-8 w-24"
                  />
                </div>
                <Row label="Sales tax credited" value={formatMoney(totals.tax, currency)} />
              </>
            )}
            <Separator />
            <Row label="Credit total" value={formatMoney(totals.total, currency)} strong />

            <p className="text-muted-foreground text-xs">
              Issuing this debits income (and sales tax) back and credits accounts receivable. The
              credit then sits unapplied until you put it against an invoice.
            </p>

            <Separator />
            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={saving}>
                <SaveIcon /> {saving ? 'Issuing…' : 'Issue credit memo'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" asChild>
                <Link href="/credit-memos">Cancel</Link>
              </Button>
            </div>
            <div className="flex justify-center">
              <UnsavedBadge dirty={dirty} />
            </div>
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
