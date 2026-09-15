'use client'
import Link from 'next/link'
import { Building2, ChevronDownIcon, LogOutIcon, PlusIcon, UserIcon } from 'lucide-react'
import { CommandPalette } from './command-palette'
import { ThemeToggle } from './theme-toggle'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ROLE_ORDER } from './nav'

export type OrgSummary = { id: number; name: string; slug: string; tier: string }

export function Topbar({
  org,
  orgs,
  user,
  role,
  features,
}: {
  org: OrgSummary
  orgs: OrgSummary[]
  user: { displayName: string; username: string }
  role: keyof typeof ROLE_ORDER
  features: Record<string, boolean>
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Building2 className="size-4" />
            <span className="max-w-40 truncate font-medium">{org.name}</span>
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Companies</DropdownMenuLabel>
          {orgs.map((o) => (
            <DropdownMenuItem key={o.id} asChild>
              <Link href={`/select-company?org=${o.id}`} className="flex items-center gap-2">
                <span className="truncate">{o.name}</span>
                {o.id === org.id && <Badge variant="muted" className="ml-auto">current</Badge>}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/orgs/new"><PlusIcon /> New company</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette role={role} features={features} />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Account">
              <UserIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-foreground text-sm font-medium">
              {user.displayName}
              <span className="text-muted-foreground block text-xs font-normal">
                {role.toLowerCase()} · {org.tier.toLowerCase().replace('_', '-')} isolation
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings">Company settings</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings/environment">Environment</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/sign-out"><LogOutIcon /> Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
