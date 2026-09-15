'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { startReconciliationAction } from '../actions'

/**
 * Starting a session asks for exactly what the statement shows: its date and
 * its ending balance. The beginning balance is not asked for — it comes from
 * the previous finished statement, so two months cannot disagree.
 */
export function StartForm({
  accounts,
  defaultAccountId,
  previousBalances,
}: {
  accounts: { id: number; label: string }[]
  defaultAccountId: number | null
  previousBalances: Record<number, string>
}) {
  const router = useRouter()
  const [accountId, setAccountId] = React.useState(
    defaultAccountId ? String(defaultAccountId) : accounts[0] ? String(accounts[0].id) : '',
  )
  const [statementDate, setStatementDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [statementBalance, setStatementBalance] = React.useState('')
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const start = () => {
    setError(null)
    startTransition(async () => {
      const result = await startReconciliationAction({
        accountId: Number(accountId),
        statementDate,
        statementBalance,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Reconciliation started')
      router.push(`/banking/reconcile?session=${result.id}`)
      router.refresh()
    })
  }

  const beginning = accountId ? previousBalances[Number(accountId)] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a reconciliation</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            start()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="recon-account">Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="recon-account">
                  <SelectValue placeholder="Choose an account" />
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
              <Label htmlFor="recon-date">Statement date</Label>
              <Input
                id="recon-date"
                type="date"
                required
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recon-balance">Ending balance</Label>
              <Input
                id="recon-balance"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
              />
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            {beginning
              ? `Beginning balance will be ${beginning}, from the last finished statement.`
              : 'This is the first reconciliation for this account, so the beginning balance is zero.'}
          </p>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending || !accountId || !statementBalance}>
            <ShieldCheckIcon /> Start reconciling
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
