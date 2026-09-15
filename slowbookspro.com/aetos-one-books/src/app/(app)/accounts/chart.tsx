'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronRightIcon,
  EyeOffIcon,
  LandmarkIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/app/page-header'
import {
  createAccountAction,
  deleteAccountAction,
  setAccountActiveAction,
  updateAccountAction,
} from './actions'

export type ChartNode = {
  id: number
  name: string
  accountNumber: string | null
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'COGS'
  parentId: number | null
  description: string | null
  bankKind: string | null
  isActive: boolean
  isControl: boolean
  controlPurpose: string | null
  lineCount: number
  depth: number
  /** Formatted for display on the server, so no Decimal crosses the wire. */
  balance: string
  rollup: string
  children: ChartNode[]
}

const TYPES = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'COGS', label: 'Cost of goods sold' },
] as const

type FormState = {
  id?: number
  name: string
  accountNumber: string
  accountType: ChartNode['accountType']
  parentId: string
  description: string
  bankKind: string
  isControl: boolean
  controlPurpose: string | null
}

const blankForm = (parentId?: number): FormState => ({
  name: '',
  accountNumber: '',
  accountType: 'EXPENSE',
  parentId: parentId ? String(parentId) : 'none',
  description: '',
  bankKind: 'none',
  isControl: false,
  controlPurpose: null,
})

const formFrom = (node: ChartNode): FormState => ({
  id: node.id,
  name: node.name,
  accountNumber: node.accountNumber ?? '',
  accountType: node.accountType,
  parentId: node.parentId ? String(node.parentId) : 'none',
  description: node.description ?? '',
  bankKind: node.bankKind ?? 'none',
  isControl: node.isControl,
  controlPurpose: node.controlPurpose,
})

export function Chart({
  roots,
  flat,
  currency,
  canEdit,
  canDelete,
}: {
  roots: ChartNode[]
  flat: ChartNode[]
  currency: string
  canEdit: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set())
  const [form, setForm] = React.useState<FormState | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<ChartNode | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const term = query.trim().toLowerCase()
  const matches = React.useMemo(() => {
    if (!term) return null
    const keep = new Set<number>()
    const byId = new Map(flat.map((n) => [n.id, n]))
    for (const node of flat) {
      const hay = `${node.accountNumber ?? ''} ${node.name}`.toLowerCase()
      if (!hay.includes(term)) continue
      let cursor: ChartNode | undefined = node
      while (cursor) {
        keep.add(cursor.id)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }
    }
    return keep
  }, [flat, term])

  const toggle = (id: number) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = (state: FormState) => {
    setError(null)
    const payload = {
      name: state.name,
      accountNumber: state.accountNumber.trim() || null,
      accountType: state.accountType,
      parentId: state.parentId === 'none' ? null : Number(state.parentId),
      description: state.description.trim() || null,
      bankKind: state.bankKind === 'none' ? null : state.bankKind,
    }
    startTransition(async () => {
      const result = state.id
        ? await updateAccountAction({ id: state.id, ...payload })
        : await createAccountAction(payload)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(state.id ? 'Account updated' : 'Account created')
      setForm(null)
      router.refresh()
    })
  }

  const deactivate = (node: ChartNode) => {
    startTransition(async () => {
      const result = await setAccountActiveAction({ id: node.id, isActive: !node.isActive })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(node.isActive ? `${node.name} deactivated` : `${node.name} reactivated`)
        router.refresh()
      }
    })
  }

  const remove = (node: ChartNode) => {
    startTransition(async () => {
      const result = await deleteAccountAction({ id: node.id })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(`${node.name} deleted`)
        setConfirmDelete(null)
        router.refresh()
      }
    })
  }

  const rows: React.ReactNode[] = []
  const render = (nodes: ChartNode[]) => {
    for (const node of nodes) {
      if (matches && !matches.has(node.id)) continue
      const hasChildren = node.children.length > 0
      const isCollapsed = collapsed.has(node.id) && !term
      rows.push(
        <li key={node.id} className="border-b last:border-b-0">
          <div
            className="hover:bg-muted/40 flex items-center gap-2 px-3 py-2 transition-colors"
            style={{ paddingLeft: `${0.75 + node.depth * 1.25}rem` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(node.id)}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.name}`}
                className="text-muted-foreground hover:text-foreground rounded p-0.5"
              >
                <ChevronRightIcon
                  className={cn('size-4 transition-transform', !isCollapsed && 'rotate-90')}
                />
              </button>
            ) : (
              <span className="size-5" aria-hidden />
            )}

            <span className="text-muted-foreground num w-16 shrink-0 text-xs">
              {node.accountNumber ?? '—'}
            </span>

            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn('truncate text-sm', !node.isActive && 'text-muted-foreground')}>
                {node.name}
              </span>
              {node.bankKind && (
                <Badge variant="muted" title="Appears in the bank register">
                  <LandmarkIcon className="size-3" />
                  {node.bankKind === 'bank' ? 'Bank' : 'Card'}
                </Badge>
              )}
              {node.isControl && (
                <Badge variant="secondary" title={node.controlPurpose ?? undefined}>
                  <LockIcon className="size-3" />
                  Control
                </Badge>
              )}
              {!node.isActive && (
                <Badge variant="warning">
                  <EyeOffIcon className="size-3" />
                  Inactive
                </Badge>
              )}
            </span>

            <span className="text-muted-foreground hidden w-28 text-xs sm:block">
              {TYPES.find((t) => t.value === node.accountType)?.label}
            </span>

            <span className="num w-32 text-right text-sm tabular-nums">
              {hasChildren && isCollapsed ? node.rollup : node.balance}
            </span>

            {canEdit && (
              <span className="flex w-24 shrink-0 justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${node.name}`}
                  onClick={() => {
                    setError(null)
                    setForm(formFrom(node))
                  }}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${node.isActive ? 'Deactivate' : 'Reactivate'} ${node.name}`}
                  onClick={() => deactivate(node)}
                  disabled={pending}
                >
                  <EyeOffIcon className="size-4" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${node.name}`}
                    onClick={() => setConfirmDelete(node)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </span>
            )}
          </div>
        </li>,
      )
      if (!isCollapsed) render(node.children)
    }
  }
  render(roots)

  const parentOptions = flat.filter((n) => n.id !== form?.id)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an account by name or number…"
          aria-label="Find an account"
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
          Expand all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(new Set(flat.filter((n) => n.children.length).map((n) => n.id)))}
        >
          Collapse all
        </Button>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => {
              setError(null)
              setForm(blankForm())
            }}
          >
            <PlusIcon /> New account
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={term ? 'No account matches that' : 'No accounts yet'}
          description={
            term
              ? 'Try a different name or number.'
              : 'A new company is seeded with a full chart of accounts. Create one to get started.'
          }
          icon={LandmarkIcon}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
            <span className="size-5" aria-hidden />
            <span className="w-16 shrink-0">Number</span>
            <span className="flex-1">Account</span>
            <span className="hidden w-28 sm:block">Type</span>
            <span className="w-32 text-right">Balance ({currency})</span>
            {canEdit && <span className="w-24" />}
          </div>
          <ul>{rows}</ul>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          {form && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit(form)
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{form.id ? 'Edit account' : 'New account'}</DialogTitle>
                <DialogDescription>
                  {form.isControl
                    ? `This is a control account — the software finds it by its number to post ${form.controlPurpose}. You can rename it, but not renumber or retype it.`
                    : 'Accounts can be nested; a parent shows the total of everything beneath it.'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="account-number">Number</Label>
                  <Input
                    id="account-number"
                    value={form.accountNumber}
                    disabled={form.isControl}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-name">Name</Label>
                  <Input
                    id="account-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="account-type">Type</Label>
                  <Select
                    value={form.accountType}
                    disabled={form.isControl}
                    onValueChange={(value) =>
                      setForm({ ...form, accountType: value as ChartNode['accountType'] })
                    }
                  >
                    <SelectTrigger id="account-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="account-parent">Sub-account of</Label>
                  <Select
                    value={form.parentId}
                    onValueChange={(value) => setForm({ ...form, parentId: value })}
                  >
                    <SelectTrigger id="account-parent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Top level</SelectItem>
                      {parentOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.accountNumber ? `${option.accountNumber} · ` : ''}
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-kind">Bank register</Label>
                <Select
                  value={form.bankKind}
                  onValueChange={(value) => setForm({ ...form, bankKind: value })}
                >
                  <SelectTrigger id="account-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not a bank account</SelectItem>
                    <SelectItem value="bank">Bank account (asset)</SelectItem>
                    <SelectItem value="credit_card">Credit card (liability)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Setting this puts the account in the register, the feeds, reconciliation and
                  every &ldquo;paid from&rdquo; picker.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-description">Description</Label>
                <Textarea
                  id="account-description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {form.id ? 'Save changes' : 'Create account'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
            <DialogDescription>
              {confirmDelete && confirmDelete.lineCount > 0
                ? `This account has ${confirmDelete.lineCount} posted line${confirmDelete.lineCount === 1 ? '' : 's'}, so it cannot be deleted. Deactivate it instead to hide it from new entries while keeping the history.`
                : 'This cannot be undone. Deactivating hides an account from new entries without touching history.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            {confirmDelete && confirmDelete.lineCount > 0 ? (
              <Button
                onClick={() => {
                  deactivate(confirmDelete)
                  setConfirmDelete(null)
                }}
                disabled={pending}
              >
                Deactivate instead
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => confirmDelete && remove(confirmDelete)}
                disabled={pending}
              >
                Delete account
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AccountsFooterNote({ total, currency }: { total: number; currency: string }) {
  return (
    <p className="text-muted-foreground text-xs">
      {total} account{total === 1 ? '' : 's'}. Balances are derived from the ledger in {currency};
      the bank register is the same data seen one account at a time —{' '}
      <Link href="/banking" className="underline underline-offset-4">
        open banking
      </Link>
      .
    </p>
  )
}

export const formatFor = (value: string, currency: string) => formatMoney(value, currency)
