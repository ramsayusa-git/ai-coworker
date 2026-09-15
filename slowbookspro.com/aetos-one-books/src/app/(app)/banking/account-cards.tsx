'use client'
import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CreditCardIcon, InboxIcon, LandmarkIcon, ShieldCheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export type AccountCard = {
  accountId: number
  accountNumber: string | null
  name: string
  bankKind: string
  balance: string
  toReview: number
  lastReconciled: string | null
  hasFeed: boolean
}

/**
 * One card per bank or card account, and the register/review switch. The card
 * carries the two numbers that decide what to do next: what the ledger says,
 * and how many statement lines are still waiting on a person.
 */
export function AccountCards({
  rows,
  selectedId,
  view,
}: {
  rows: AccountCard[]
  selectedId: number
  view: 'register' | 'review'
}) {
  const router = useRouter()
  const params = useSearchParams()

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(patch)) next.set(key, value)
    router.push(`?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const Icon = row.bankKind === 'credit_card' ? CreditCardIcon : LandmarkIcon
          const active = row.accountId === selectedId
          return (
            <Card
              key={row.accountId}
              className={cn(
                'cursor-pointer transition-shadow hover:shadow-sm',
                active && 'ring-primary/50 ring-2',
              )}
              onClick={() => go({ account: String(row.accountId) })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  go({ account: String(row.accountId) })
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={active}
            >
              <CardContent className="space-y-2 py-4">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Icon className="size-4" />
                  <span className="truncate">
                    {row.accountNumber ? `${row.accountNumber} · ` : ''}
                    {row.name}
                  </span>
                </div>
                <p className="num text-2xl font-semibold tracking-tight">{row.balance}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {row.toReview > 0 ? (
                    <Badge variant="warning">
                      <InboxIcon className="size-3" />
                      {row.toReview} to review
                    </Badge>
                  ) : row.hasFeed ? (
                    <Badge variant="muted">Nothing to review</Badge>
                  ) : (
                    <Badge variant="muted">No feed</Badge>
                  )}
                  {row.lastReconciled ? (
                    <Badge variant="success">
                      <ShieldCheckIcon className="size-3" />
                      Reconciled to {row.lastReconciled}
                    </Badge>
                  ) : (
                    <Badge variant="muted">Never reconciled</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center gap-1" role="tablist" aria-label="Banking view">
        <Button
          role="tab"
          aria-selected={view === 'register'}
          variant={view === 'register' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => go({ view: 'register' })}
        >
          Register
        </Button>
        <Button
          role="tab"
          aria-selected={view === 'review'}
          variant={view === 'review' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => go({ view: 'review' })}
        >
          To review
        </Button>
      </div>
    </div>
  )
}
