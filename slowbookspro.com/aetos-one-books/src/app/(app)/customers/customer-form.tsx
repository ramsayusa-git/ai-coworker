'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import { saveCustomer } from './actions'

export type CustomerDraft = {
  name: string
  companyName: string
  email: string
  phone: string
  mobile: string
  website: string
  billAddress1: string
  billAddress2: string
  billCity: string
  billState: string
  billZip: string
  shipAddress1: string
  shipAddress2: string
  shipCity: string
  shipState: string
  shipZip: string
  terms: string
  creditLimit: string
  taxId: string
  isTaxable: boolean
  notes: string
}

export const emptyCustomer: CustomerDraft = {
  name: '', companyName: '', email: '', phone: '', mobile: '', website: '',
  billAddress1: '', billAddress2: '', billCity: '', billState: '', billZip: '',
  shipAddress1: '', shipAddress2: '', shipCity: '', shipState: '', shipZip: '',
  terms: 'Net 30', creditLimit: '', taxId: '', isTaxable: true, notes: '',
}

const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90']

export function CustomerForm({
  id,
  initial,
  noun,
}: {
  id: number | null
  initial: CustomerDraft
  /** "customer" or, in nonprofit mode, "donor". */
  noun: string
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const copyBillingToShipping = () =>
    setDraft((current) => ({
      ...current,
      shipAddress1: current.billAddress1,
      shipAddress2: current.billAddress2,
      shipCity: current.billCity,
      shipState: current.billState,
      shipZip: current.billZip,
    }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveCustomer({ id, data: draft })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(id ? `${capitalise(noun)} updated` : `${capitalise(noun)} created`)
      router.push(`/customers/${result.id}`)
    })
  }

  const fieldError = (field: keyof CustomerDraft) =>
    error?.field === field ? error.message : undefined

  return (
    <form onSubmit={submit} className="space-y-5">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required error={fieldError('name')} className="sm:col-span-2">
              <Input
                id="name"
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                autoFocus
                aria-invalid={Boolean(fieldError('name'))}
                placeholder={`What this ${noun} is called on documents`}
              />
            </Field>
            <Field label="Company" htmlFor="companyName">
              <Input id="companyName" value={draft.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email" error={fieldError('email')}>
              <Input
                id="email"
                type="email"
                value={draft.email}
                onChange={(e) => set('email', e.target.value)}
                aria-invalid={Boolean(fieldError('email'))}
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Mobile" htmlFor="mobile">
              <Input id="mobile" value={draft.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="website" className="sm:col-span-2">
              <Input id="website" value={draft.website} onChange={(e) => set('website', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms and tax</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Payment terms" htmlFor="terms" hint="Sets the default due date on new invoices.">
              <Select value={draft.terms} onValueChange={(value) => set('terms', value)}>
                <SelectTrigger id="terms"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((term) => (
                    <SelectItem key={term} value={term}>{term}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Credit limit" htmlFor="creditLimit">
              <MoneyInput
                id="creditLimit"
                value={draft.creditLimit}
                onValueChange={(value) => set('creditLimit', value)}
                placeholder="No limit"
              />
            </Field>
            <Field label="Tax registration" htmlFor="taxId">
              <Input id="taxId" value={draft.taxId} onChange={(e) => set('taxId', e.target.value)} />
            </Field>
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Charge sales tax</p>
                <p className="text-muted-foreground text-xs">
                  Turn off for a reseller or an exempt organisation. Lines can still be exempted
                  one at a time.
                </p>
              </div>
              <Switch
                checked={draft.isTaxable}
                onCheckedChange={(checked) => set('isTaxable', checked)}
                aria-label="Charge sales tax on this customer"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" htmlFor="billAddress1" className="sm:col-span-2">
              <Input id="billAddress1" value={draft.billAddress1} onChange={(e) => set('billAddress1', e.target.value)} />
            </Field>
            <Field label="Address line 2" htmlFor="billAddress2" className="sm:col-span-2">
              <Input id="billAddress2" value={draft.billAddress2} onChange={(e) => set('billAddress2', e.target.value)} />
            </Field>
            <Field label="City" htmlFor="billCity">
              <Input id="billCity" value={draft.billCity} onChange={(e) => set('billCity', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" htmlFor="billState">
                <Input id="billState" value={draft.billState} onChange={(e) => set('billState', e.target.value)} />
              </Field>
              <Field label="ZIP" htmlFor="billZip">
                <Input id="billZip" value={draft.billZip} onChange={(e) => set('billZip', e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Shipping address</CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={copyBillingToShipping}>
              Same as billing
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" htmlFor="shipAddress1" className="sm:col-span-2">
              <Input id="shipAddress1" value={draft.shipAddress1} onChange={(e) => set('shipAddress1', e.target.value)} />
            </Field>
            <Field label="Address line 2" htmlFor="shipAddress2" className="sm:col-span-2">
              <Input id="shipAddress2" value={draft.shipAddress2} onChange={(e) => set('shipAddress2', e.target.value)} />
            </Field>
            <Field label="City" htmlFor="shipCity">
              <Input id="shipCity" value={draft.shipCity} onChange={(e) => set('shipCity', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" htmlFor="shipState">
                <Input id="shipState" value={draft.shipState} onChange={(e) => set('shipState', e.target.value)} />
              </Field>
              <Field label="ZIP" htmlFor="shipZip">
                <Input id="shipZip" value={draft.shipZip} onChange={(e) => set('shipZip', e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Internal notes" htmlFor="notes" hint="Never printed on a document.">
            <Textarea id="notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <UnsavedBadge dirty={dirty} />
        <Button type="button" variant="outline" asChild>
          <Link href={id ? `/customers/${id}` : '/customers'}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : id ? 'Save changes' : `Create ${noun}`}
        </Button>
      </div>
    </form>
  )
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
