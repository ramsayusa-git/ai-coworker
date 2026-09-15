'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { SearchIcon } from 'lucide-react'
import { NAV, ROLE_ORDER } from './nav'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * ⌘K palette: every screen, every "new X" action and a live record search in
 * one place. The old product made you find things through nested menus.
 */
export function CommandPalette({
  role,
  features,
}: {
  role: keyof typeof ROLE_ORDER
  features: Record<string, boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<
    { type: string; label: string; sub?: string; href: string }[]
  >([])
  const router = useRouter()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (res.ok) setResults(await res.json())
      } catch {
        /* aborted */
      }
    }, 150)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  const items = NAV.flatMap((s) =>
    s.items
      .filter((i) => !(i.minRole && ROLE_ORDER[role] < ROLE_ORDER[i.minRole]))
      .filter((i) => !(i.feature && !features[i.feature]))
      .map((i) => ({ ...i, section: s.title })),
  )

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground w-56 justify-start gap-2 font-normal"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4" />
        Search or jump to…
        <kbd className="bg-muted ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0" size="md">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <Command shouldFilter={false} loop className="overflow-hidden">
            <div className="flex items-center gap-2 border-b px-3">
              <SearchIcon className="text-muted-foreground size-4" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="Search invoices, customers, accounts — or jump to a screen"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="scrollbar-thin max-h-80 overflow-y-auto p-2">
              <Command.Empty className="text-muted-foreground py-8 text-center text-sm">
                Nothing matched “{query}”.
              </Command.Empty>

              {results.length > 0 && (
                <Command.Group heading="Records" className="text-muted-foreground px-1 pb-1 text-xs">
                  {results.map((r) => (
                    <Command.Item
                      key={`${r.type}-${r.href}`}
                      value={`${r.type}-${r.href}`}
                      onSelect={() => go(r.href)}
                      className={itemClass}
                    >
                      <span className="text-muted-foreground w-20 shrink-0 text-xs capitalize">{r.type}</span>
                      <span className="truncate">{r.label}</span>
                      {r.sub && <span className="text-muted-foreground ml-auto text-xs">{r.sub}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Go to" className="text-muted-foreground px-1 pb-1 text-xs">
                {items
                  .filter((i) =>
                    query.length < 2
                      ? true
                      : [i.label, i.section, ...(i.keywords ?? [])]
                          .join(' ')
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                  )
                  .slice(0, 12)
                  .map((i) => {
                    const Icon = i.icon
                    return (
                      <Command.Item
                        key={i.href}
                        value={i.href}
                        onSelect={() => go(i.href)}
                        className={itemClass}
                      >
                        <Icon className="size-4" />
                        <span>{i.label}</span>
                        <span className="text-muted-foreground ml-auto text-xs">{i.section}</span>
                      </Command.Item>
                    )
                  })}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}

const itemClass = cn(
  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground',
  'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
)
