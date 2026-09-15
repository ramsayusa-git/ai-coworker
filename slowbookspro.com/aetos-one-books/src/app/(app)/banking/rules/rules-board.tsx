'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PencilIcon, PlayIcon, PlusIcon, Trash2Icon, WrenchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/app/page-header'
import {
  applyBankRulesAction,
  createBankRuleAction,
  deleteBankRuleAction,
  updateBankRuleAction,
} from '../actions'

export type RuleRow = {
  id: number
  name: string
  pattern: string
  ruleType: 'CONTAINS' | 'STARTS_WITH' | 'EXACT'
  accountId: number | null
  accountLabel: string | null
  priority: number
  isActive: boolean
}

type Picker = { id: number; label: string }

const TYPE_LABEL: Record<RuleRow['ruleType'], string> = {
  CONTAINS: 'Payee contains',
  STARTS_WITH: 'Payee starts with',
  EXACT: 'Payee is exactly',
}

type Form = {
  id?: number
  name: string
  pattern: string
  ruleType: RuleRow['ruleType']
  accountId: string
  priority: string
  isActive: boolean
}

const blank: Form = {
  name: '',
  pattern: '',
  ruleType: 'CONTAINS',
  accountId: '',
  priority: '0',
  isActive: true,
}

/**
 * Rules categorise; they never post. Priority runs high to low and the first
 * hit wins — including a hit that sets nothing, which is a deliberate way to
 * shield a payee from every rule below it.
 */
export function RulesBoard({ rules, accounts }: { rules: RuleRow[]; accounts: Picker[] }) {
  const router = useRouter()
  const [form, setForm] = React.useState<Form | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<RuleRow | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const save = (state: Form) => {
    setError(null)
    const payload = {
      name: state.name,
      pattern: state.pattern,
      ruleType: state.ruleType,
      accountId: state.accountId ? Number(state.accountId) : null,
      priority: Number(state.priority || 0),
      isActive: state.isActive,
    }
    startTransition(async () => {
      const result = state.id
        ? await updateBankRuleAction({ id: state.id, ...payload })
        : await createBankRuleAction(payload)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(state.id ? 'Rule updated' : 'Rule created')
      setForm(null)
      router.refresh()
    })
  }

  const toggleActive = (rule: RuleRow) =>
    startTransition(async () => {
      const result = await updateBankRuleAction({ id: rule.id, isActive: !rule.isActive })
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })

  const remove = (rule: RuleRow) =>
    startTransition(async () => {
      const result = await deleteBankRuleAction({ id: rule.id })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success('Rule deleted')
        setConfirmDelete(null)
        router.refresh()
      }
    })

  const applyNow = () =>
    startTransition(async () => {
      const result = await applyBankRulesAction()
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(
          result.categorised === 0
            ? 'No uncategorised line matched a rule'
            : `${result.categorised} line${result.categorised === 1 ? '' : 's'} categorised, ${result.remaining} still to review`,
        )
        router.refresh()
      }
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled={pending} onClick={applyNow}>
          <PlayIcon /> Apply to the queue
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setError(null)
            setForm({ ...blank })
          }}
        >
          <PlusIcon /> New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="A rule matches a payee and sets the category on every statement line that arrives. It never posts anything — accepting a line is still a click."
          icon={WrenchIcon}
          action={
            <Button size="sm" onClick={() => setForm({ ...blank })}>
              Create the first rule
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead numeric className="w-20">
                  Priority
                </TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Sets category</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className={rule.isActive ? undefined : 'opacity-60'}>
                  <TableCell numeric>{rule.priority}</TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {TYPE_LABEL[rule.ruleType]} &ldquo;{rule.pattern}&rdquo;
                  </TableCell>
                  <TableCell>
                    {rule.accountLabel ? (
                      rule.accountLabel
                    ) : (
                      <Badge variant="muted" title="A hit still wins and stops lower rules">
                        Nothing — blocks lower rules
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.isActive}
                      disabled={pending}
                      aria-label={`${rule.isActive ? 'Disable' : 'Enable'} ${rule.name}`}
                      onCheckedChange={() => toggleActive(rule)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${rule.name}`}
                        onClick={() => {
                          setError(null)
                          setForm({
                            id: rule.id,
                            name: rule.name,
                            pattern: rule.pattern,
                            ruleType: rule.ruleType,
                            accountId: rule.accountId ? String(rule.accountId) : '',
                            priority: String(rule.priority),
                            isActive: rule.isActive,
                          })
                        }}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${rule.name}`}
                        onClick={() => setConfirmDelete(rule)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          {form && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                save(form)
              }}
            >
              <DialogHeader>
                <DialogTitle>{form.id ? 'Edit rule' : 'New rule'}</DialogTitle>
                <DialogDescription>
                  Matching is case-insensitive and on the payee only — no amounts, no dates, no
                  regular expressions.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-type">Condition</Label>
                  <Select
                    value={form.ruleType}
                    onValueChange={(value) =>
                      setForm({ ...form, ruleType: value as RuleRow['ruleType'] })
                    }
                  >
                    <SelectTrigger id="rule-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABEL) as RuleRow['ruleType'][]).map((type) => (
                        <SelectItem key={type} value={type}>
                          {TYPE_LABEL[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-pattern">Pattern</Label>
                  <Input
                    id="rule-pattern"
                    required
                    value={form.pattern}
                    placeholder="e.g. shell oil"
                    onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-account">Category</Label>
                  <Select
                    value={form.accountId}
                    onValueChange={(value) => setForm({ ...form, accountId: value })}
                  >
                    <SelectTrigger id="rule-account">
                      <SelectValue placeholder="Set nothing (block lower rules)" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-priority">Priority</Label>
                  <Input
                    id="rule-priority"
                    inputMode="numeric"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="rule-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
                <Label htmlFor="rule-active">Active</Label>
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
                  {form.id ? 'Save rule' : 'Create rule'}
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
              Statement lines this rule already categorised keep their category. Only future lines
              change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              Delete rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
