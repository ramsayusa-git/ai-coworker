'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SaveIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/app/sales-field'
import { MoneyInput } from '@/components/app/money-input'
import { EntityPicker } from '@/components/app/entity-picker'
import { UnsavedBadge, UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard'
import type { AccountOption } from '@/components/app/purchase-line-editor'
import type { VendorOption } from '../bills/editor-data'
import { saveSpend } from './actions'

export type SpendDraft = {
  kind: 'expense' | 'card'
  date: string
  vendorId: number | null
  payee: string
  expenseAccountId: number | null
  paidFromAccountId: number | null
  amount: string
  reference: string
  memo: string
}

/**
 * One form, two documents. Switching the tab changes which accounts are on
 * offer for the money side and which account gets credited — nothing else.
 */
export function ExpenseForm({
  initial,
  vendors,
  expenseAccounts,
  paymentAccounts,
  cardAccounts,
  currency,
}: {
  initial: SpendDraft
  vendors: VendorOption[]
  expenseAccounts: AccountOption[]
  paymentAccounts: AccountOption[]
  cardAccounts: AccountOption[]
  currency: string
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState(initial)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof SpendDraft>(key: K, value: SpendDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const moneyAccounts = draft.kind === 'card' ? cardAccounts : paymentAccounts

  const changeKind = (kind: 'expense' | 'card') =>
    setDraft((current) => ({
      ...current,
      kind,
      // The account that was valid for one side may not exist on the other.
      paidFromAccountId:
        (kind === 'card' ? cardAccounts : paymentAccounts).some(
          (account) => account.id === current.paidFromAccountId,
        )
          ? current.paidFromAccountId
          : ((kind === 'card' ? cardAccounts : paymentAccounts)[0]?.id ?? null),
    }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startSaving(async () => {
      const result = await saveSpend(draft)
      if (!result.ok) {
        setError({ field: result.field, message: result.error })
        toast.error(result.error)
        return
      }
      setSaved(true)
      toast.success(draft.kind === 'card' ? 'Card charge recorded' : 'Expense recorded')
      router.push(`/expenses/${result.id}`)
    })
  }

  const fieldError = (field: keyof SpendDraft) =>
    error?.field === field ? error.message : undefined

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <UnsavedChangesGuard dirty={dirty && !saving} />

      <Tabs value={draft.kind} onValueChange={(value) => changeKind(value as 'expense' | 'card')}>
        <TabsList>
          <TabsTrigger value="expense">Expense</TabsTrigger>
          <TabsTrigger value="card">Credit-card charge</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>
            {draft.kind === 'card' ? 'What went on the card?' : 'What was paid for?'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="date" required error={fieldError('date')}>
            <Input
              id="date"
              type="date"
              value={draft.date}
              onChange={(event) => set('date', event.target.value)}
            />
          </Field>
          <Field label="Amount" htmlFor="amount" required error={fieldError('amount')}>
            <MoneyInput
              id="amount"
              value={draft.amount}
              onValueChange={(value) => set('amount', value)}
            />
          </Field>
          <Field label="Vendor" htmlFor="vendorId" hint="Optional — links the spend to a vendor record.">
            <EntityPicker
              id="vendorId"
              options={vendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
              value={draft.vendorId}
              onSelect={(vendorId) => set('vendorId', vendorId)}
              placeholder="Not a tracked vendor"
              searchPlaceholder="Filter vendors…"
              emptyLabel="No vendor matches"
              allowClear
            />
          </Field>
          <Field label="Payee" htmlFor="payee" hint="Used when the spend is not against a vendor.">
            <Input
              id="payee"
              value={draft.payee}
              onChange={(event) => set('payee', event.target.value)}
              placeholder="Who was paid"
            />
          </Field>
          <Field
            label="Spent on"
            htmlFor="expenseAccountId"
            required
            error={fieldError('expenseAccountId')}
          >
            <EntityPicker
              id="expenseAccountId"
              options={expenseAccounts.map((account) => ({
                id: account.id,
                label: account.name,
                hint: account.accountNumber ?? undefined,
              }))}
              value={draft.expenseAccountId}
              onSelect={(value) => set('expenseAccountId', value)}
              placeholder="Which expense account?"
              searchPlaceholder="Filter accounts…"
              emptyLabel="No account matches"
            />
          </Field>
          <Field
            label={draft.kind === 'card' ? 'Card' : 'Paid from'}
            htmlFor="paidFromAccountId"
            required
            error={fieldError('paidFromAccountId')}
          >
            <EntityPicker
              id="paidFromAccountId"
              options={moneyAccounts.map((account) => ({
                id: account.id,
                label: account.name,
                hint: account.accountNumber ?? undefined,
              }))}
              value={draft.paidFromAccountId}
              onSelect={(value) => set('paidFromAccountId', value)}
              placeholder={draft.kind === 'card' ? 'Which card?' : 'Bank, cash or card'}
              searchPlaceholder="Filter accounts…"
              emptyLabel="No account matches"
            />
          </Field>
          <Field label="Reference" htmlFor="reference">
            <Input
              id="reference"
              value={draft.reference}
              onChange={(event) => set('reference', event.target.value)}
              placeholder="Receipt or check number"
            />
          </Field>
          <Field label="Memo" htmlFor="memo" className="sm:col-span-2">
            <Textarea
              id="memo"
              rows={2}
              value={draft.memo}
              onChange={(event) => set('memo', event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          <SaveIcon /> {saving ? 'Recording…' : 'Record it'}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/expenses">Cancel</Link>
        </Button>
        <UnsavedBadge dirty={dirty} />
      </div>

      <p className="text-muted-foreground text-xs">
        Posting is immediate: the account you chose is debited for{' '}
        {draft.amount || '0.00'} {currency}, and{' '}
        {draft.kind === 'card' ? 'the card' : 'the account you paid from'} is credited.
      </p>
    </form>
  )
}
