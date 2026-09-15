'use client'

import * as React from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  FileText,
  LandmarkIcon,
  LayoutDashboard,
  Menu,
  PackageSearch,
  Receipt,
  ScrollText,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LedgerWordmark } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/app/theme-toggle'
import { cn } from '@/lib/utils'

const PRODUCT_LINKS = [
  {
    title: 'Bookkeeping',
    href: '#features',
    desc: 'Double-entry general ledger, built for accountants.',
    icon: ScrollText,
  },
  {
    title: 'Invoicing',
    href: '#features',
    desc: 'Estimates, recurring invoices, and online payments.',
    icon: Receipt,
  },
  {
    title: 'Payroll',
    href: '#features',
    desc: 'Run payroll and post journal entries automatically.',
    icon: Wallet,
  },
  {
    title: 'Inventory',
    href: '#features',
    desc: 'Track items, costs, and stock across locations.',
    icon: PackageSearch,
  },
  {
    title: 'Banking',
    href: '#features',
    desc: 'Connect accounts and reconcile transactions fast.',
    icon: LandmarkIcon,
  },
  {
    title: 'Reports & Analytics',
    href: '#features',
    desc: 'P&L, balance sheet, cash flow — always current.',
    icon: LayoutDashboard,
  },
]

const NAV_LINKS = [
  { label: 'Compare', href: '#compare' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '#' },
]

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false)
  const [productOpen, setProductOpen] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b bg-background/80 backdrop-blur-lg shadow-sm'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/">
          <LedgerWordmark />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}
          >
            <button
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
              aria-expanded={productOpen}
            >
              Product
              <ChevronDown className={cn('size-3.5 transition-transform', productOpen && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {productOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute left-1/2 top-full w-[640px] -translate-x-1/2 pt-3"
                >
                  <div className="grid grid-cols-2 gap-1 rounded-2xl border bg-popover p-3 shadow-xl shadow-black/5">
                    {PRODUCT_LINKS.map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-accent"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <item.icon className="size-4.5" />
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-foreground">{item.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{item.desc}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-in">Get started free</Link>
          </Button>
        </div>

        <button
          className="flex items-center justify-center rounded-md p-2 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b bg-background lg:hidden"
          >
            <div className="space-y-1 px-4 pb-4 pt-2">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Product
              </p>
              {PRODUCT_LINKS.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="size-4 text-primary" />
                  {item.title}
                </Link>
              ))}
              <div className="my-2 h-px bg-border" />
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
                  onClick={() => setMobileOpen(false)}
                >
                  <FileText className="size-4 text-muted-foreground" />
                  {link.label}
                </Link>
              ))}
              <div className="flex items-center gap-2 pt-3">
                <Button variant="outline" className="flex-1" asChild>
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button className="flex-1" asChild>
                  <Link href="/sign-in">
                    <Users className="size-4" /> Get started
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
