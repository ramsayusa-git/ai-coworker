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
import { EntityPicker } from '@/components/app/entity-picker'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import type { AccountOption } from '@/components/app/purchase-line-editor'
import { saveVendor } from './actions'

export type VendorDraft = {
  name: string
  companyName: string
  email: string
  phone: string
  fax: string
  website: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  country: string
  terms: string
  taxId: string
  accountNumber: string
  defaultExpenseAccountId: number | null
  is1099Vendor: boolean
  vendor1099Type: string
  is1099Eligible: boolean
  w9OnFile: boolean
  notes: string
}

export const emptyVendor: VendorDraft = {
  name: '', companyName: '', email: '', phone: '', fax: '', website: '',
  address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
  terms: 'Net 30', taxId: '', accountNumber: '', defaultExpenseAccountId: null,
  is1099Vendor: false, vendor1099Type: 'NEC', is1099Eligible: false, w9OnFile: false, notes: '',
}

const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90']

export function VendorForm({
  id,
  initial,
  expenseAccounts,
}: {
  id: number | null
  initial: VendorDraft
  expenseAccounts: AccountOption[]
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveVendor({ id, data: draft })
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(id ? 'Vendor updated' : 'Vendor created')
      router.push(`/vendors/${result.id}`)
    })
  }

  const fieldError = (field: keyof VendorDraft) =>
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
                placeholder="What this vendor is called on bills"
              />
            </Field>
            <Field label="Company" htmlFor="companyName">
              <Input
                id="companyName"
                value={draft.companyName}
                onChange={(e) => set('companyName', e.target.value)}
              />
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
            <Field label="Fax" htmlFor="fax">
              <Input id="fax" value={draft.fax} onChange={(e) => set('fax', e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="website" className="sm:col-span-2">
              <Input
                id="website"
                value={draft.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms and posting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Payment terms" htmlFor="terms">
              <Select value={draft.terms} onValueChange={(value) => set('terms', value)}>
                <SelectTrigger id="terms"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((term) => (
                    <SelectItem key={term} value={term}>{term}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Default expense account"
              htmlFor="defaultExpenseAccountId"
              hint="Where a bill line lands when neither the line nor the item names an account."
            >
              <EntityPicker
                id="defaultExpenseAccountId"
                options={expenseAccounts.map((account) => ({
                  id: account.id,
                  label: account.name,
                  hint: account.accountNumber ?? undefined,
                }))}
                value={draft.defaultExpenseAccountId}
                onSelect={(value) => set('defaultExpenseAccountId', value)}
                placeholder="Uncategorised expense"
                searchPlaceholder="Filter accounts…"
                emptyLabel="No account matches"
                allowClear
              />
            </Field>
            <Field label="Our account number with them" htmlFor="accountNumber">
              <Input
                id="accountNumber"
                value={draft.accountNumber}
                onChange={(e) => set('accountNumber', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1" htmlFor="address1" className="sm:col-span-2">
              <Input id="address1" value={draft.address1} onChange={(e) => set('address1', e.target.value)} />
            </Field>
            <Field label="Address line 2" htmlFor="address2" className="sm:col-span-2">
              <Input id="address2" value={draft.address2} onChange={(e) => set('address2', e.target.value)} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" value={draft.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="State" htmlFor="state">
              <Input id="state" value={draft.state} onChange={(e) => set('state', e.target.value)} />
            </Field>
            <Field label="ZIP" htmlFor="zip">
              <Input id="zip" value={draft.zip} onChange={(e) => set('zip', e.target.value)} />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input id="country" value={draft.country} onChange={(e) => set('country', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>1099 tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="is1099Vendor" className="text-sm">Track for 1099</label>
              <Switch
                id="is1099Vendor"
                checked={draft.is1099Vendor}
                onCheckedChange={(checked) => set('is1099Vendor', checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="is1099Eligible" className="text-sm">Eligible to receive one</label>
              <Switch
                id="is1099Eligible"
                checked={draft.is1099Eligible}
                onCheckedChange={(checked) => set('is1099Eligible', checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="w9OnFile" className="text-sm">W-9 on file</label>
              <Switch
                id="w9OnFile"
                checked={draft.w9OnFile}
                onCheckedChange={(checked) => set('w9OnFile', checked)}
              />
            </div>
            <Field label="Form" htmlFor="vendor1099Type">
              <Select
                value={draft.vendor1099Type || 'NEC'}
                onValueChange={(value) => set('vendor1099Type', value)}
              >
                <SelectTrigger id="vendor1099Type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEC">1099-NEC</SelectItem>
                  <SelectItem value="MISC">1099-MISC</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tax ID" htmlFor="taxId" hint="EIN or SSN, as it appears on the W-9.">
              <Input id="taxId" value={draft.taxId} onChange={(e) => set('taxId', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Internal notes" htmlFor="notes" hint="Never printed on a document.">
              <Textarea
                id="notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Create vendor'}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={id ? `/vendors/${id}` : '/vendors'}>Cancel</Link>
        </Button>
        <UnsavedBadge dirty={dirty} />
      </div>
    </form>
  )
}
