'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Quote } from 'lucide-react'
import { LedgerWordmark } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

const QUOTES = [
  {
    quote:
      'We migrated 6 years of Tally data over a weekend. Our accountant now closes the books in a day instead of a week.',
    name: 'Priya Menon',
    role: 'Finance Lead, Northbridge Retail',
  },
  {
    quote:
      "White-labeling let us ship accounting inside our own SaaS in two weeks — we'd have spent a year building this ourselves.",
    name: 'Daniel Ortiz',
    role: 'CTO, Fielding Platforms',
  },
  {
    quote:
      "Self-hosted mode was the whole reason we switched. Our data never leaves our own servers, and we still get every feature.",
    name: 'Sofia Bianchi',
    role: 'Controller, Meridian Nonprofit',
  },
]

export function Testimonials() {
  return (
    <section className="border-y bg-muted/30 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Trusted by teams who switched
        </h2>
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <motion.figure
              key={q.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.45 }}
              className="flex flex-col rounded-2xl border bg-card p-6"
            >
              <Quote className="size-5 text-primary/50" />
              <blockquote className="mt-3 flex-1 text-sm text-foreground/90">
                &ldquo;{q.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {q.name.split(' ').map((n) => n[0]).join('')}
                </span>
                <span>
                  <span className="block text-sm font-medium">{q.name}</span>
                  <span className="block text-xs text-muted-foreground">{q.role}</span>
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CTASection() {
  return (
    <section className="relative overflow-hidden py-24">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,var(--brand-primary)_0%,transparent_70%)] opacity-[0.08]"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-3xl rounded-3xl border bg-card px-6 py-14 text-center shadow-xl shadow-black/5 sm:px-14"
      >
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Own your books. Own your data.
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Start free in the cloud today, or talk to us about a self-hosted, white-labeled
          deployment for your team.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="group h-11 px-6" asChild>
            <Link href="/sign-in">
              Get started free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-11 px-6" asChild>
            <Link href="#pricing">View pricing</Link>
          </Button>
        </div>
      </motion.div>
    </section>
  )
}

const FOOTER_COLS = [
  {
    title: 'Product',
    links: ['Bookkeeping', 'Invoicing', 'Payroll', 'Inventory', 'Reports'],
  },
  {
    title: 'Compare',
    links: ['vs QuickBooks', 'vs Xero', 'vs Zoho Books', 'vs Wave', 'vs Tally'],
  },
  {
    title: 'Company',
    links: ['About', 'Blog', 'Careers', 'Contact'],
  },
  {
    title: 'Legal',
    links: ['Privacy', 'Terms', 'Security'],
  },
]

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link href="/">
              <LedgerWordmark />
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Bookkeeping that stays yours. Built by Aetos Tech Labs.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l}>
                    <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Aetos Tech Labs. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">Made for accountants who value ownership.</p>
        </div>
      </div>
    </footer>
  )
}
