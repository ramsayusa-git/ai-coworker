'use client'

import { motion } from 'framer-motion'
import { Check, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Cell = boolean | 'partial' | string

const ROWS: { label: string; us: Cell; qb: Cell; xero: Cell; zoho: Cell; wave: Cell; tally: Cell }[] = [
  { label: 'Starting price / mo', us: '$0', qb: '$35', xero: '$29', zoho: '$0', wave: '$0', tally: '₹5,000/yr' },
  { label: 'Self-hosted option', us: true, qb: false, xero: false, zoho: false, wave: false, tally: 'partial' },
  { label: 'White-label branding', us: true, qb: false, xero: false, zoho: false, wave: false, tally: false },
  { label: 'Open REST API + webhooks', us: true, qb: 'partial', xero: 'partial', zoho: 'partial', wave: false, tally: false },
  { label: 'Payroll included', us: true, qb: 'partial', xero: 'partial', zoho: 'partial', wave: false, tally: 'partial' },
  { label: 'Inventory & fixed assets', us: true, qb: true, xero: true, zoho: true, wave: false, tally: true },
  { label: 'Multi-currency', us: true, qb: 'partial', xero: true, zoho: true, wave: 'partial', tally: 'partial' },
  { label: 'Modern web UI', us: true, qb: true, xero: true, zoho: true, wave: true, tally: false },
  { label: 'Vendor lock-in', us: false, qb: true, xero: true, zoho: true, wave: true, tally: true },
]

const COLS: { key: keyof (typeof ROWS)[number]; label: string; highlight?: boolean }[] = [
  { key: 'us', label: 'Aetos One Books', highlight: true },
  { key: 'qb', label: 'QuickBooks' },
  { key: 'xero', label: 'Xero' },
  { key: 'zoho', label: 'Zoho Books' },
  { key: 'wave', label: 'Wave' },
  { key: 'tally', label: 'Tally' },
]

function CellValue({ value }: { value: Cell }) {
  if (value === true) return <Check className="mx-auto size-4.5 text-emerald-500" />
  if (value === false) return <X className="mx-auto size-4 text-muted-foreground/40" />
  if (value === 'partial') return <Minus className="mx-auto size-4 text-amber-500" />
  return <span className="text-sm font-medium">{value}</span>
}

export function Compare() {
  return (
    <section id="compare" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          How we compare
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Same double-entry rigor as the incumbents — plus the two things none of them offer:
          self-hosting and white-label branding, out of the box.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="mt-12 overflow-x-auto rounded-2xl border shadow-sm"
      >
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 bg-muted/40 px-4 py-3.5 text-left font-medium text-muted-foreground">
                &nbsp;
              </th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-4 py-3.5 text-center font-medium',
                    c.highlight && 'bg-primary/10 text-primary',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={row.label} className={cn(i % 2 === 1 && 'bg-muted/20')}>
                <td className="sticky left-0 whitespace-nowrap bg-inherit px-4 py-3 font-medium">
                  {row.label}
                </td>
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-4 py-3 text-center', c.highlight && 'bg-primary/5')}
                  >
                    <CellValue value={row[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Competitor pricing and features shown are publicly listed entry-tier plans as of 2026 and may change.
      </p>
    </section>
  )
}
