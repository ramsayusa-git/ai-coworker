'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronsLeftIcon } from 'lucide-react'
import { NAV, ROLE_ORDER, type NavSection } from './nav'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type SidebarProps = {
  role: keyof typeof ROLE_ORDER
  features: Record<string, boolean>
  brand: { productName: string; shortName: string; logoLight: string | null; logoDark: string | null }
}

export function Sidebar({ role, features, brand }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const sections: NavSection[] = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.minRole && ROLE_ORDER[role] < ROLE_ORDER[item.minRole]) return false
      if (item.feature && !features[item.feature]) return false
      return true
    }),
  })).filter((section) => section.items.length > 0)

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'bg-sidebar text-sidebar-foreground border-sidebar-border flex h-svh shrink-0 flex-col border-r transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold">
            {brand.shortName.slice(0, 2)}
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold">{brand.productName}</span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronsLeftIcon className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
        </Button>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="text-muted-foreground px-2 pb-1 text-[11px] font-medium tracking-wide uppercase">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                const Icon = item.icon
                const link = (
                  <Link
                    href={item.href}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-sidebar-accent',
                      collapsed && 'justify-center px-0',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
