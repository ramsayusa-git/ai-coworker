'use client'

import { motion } from 'framer-motion'
import {
  BadgePercent,
  BarChart3,
  Fingerprint,
  Globe2,
  LandmarkIcon,
  Layers,
  PackageSearch,
  Receipt,
  ScrollText,
  ShieldCheck,
  Wallet,
  Webhook,
} from 'lucide-react'

const FEATURES = [
  {
    icon: ScrollText,
    title: 'Double-entry general ledger',
    desc: 'Full chart of accounts, journal entries, and audit trail — accountant-grade from day one.',
  },
  {
    icon: Receipt,
    title: 'Invoicing & estimates',
    desc: 'Branded invoices, recurring billing, credit memos, and online payment links.',
  },
  {
    icon: Wallet,
    title: 'Payroll',
    desc: 'Run payroll and post the journal entries automatically — no spreadsheet exports.',
  },
  {
    icon: PackageSearch,
    title: 'Inventory & fixed assets',
    desc: 'Track stock, costs, and depreciation across locations without a separate ERP.',
  },
  {
    icon: LandmarkIcon,
    title: 'Bank feeds & reconciliation',
    desc: 'Connect accounts, auto-match transactions, and close the books in minutes.',
  },
  {
    icon: BarChart3,
    title: 'Real-time reports',
    desc: 'P&L, balance sheet, and cash flow that update the moment a transaction posts.',
  },
  {
    icon: Layers,
    title: 'White-label, no fork',
    desc: 'Runtime branding — logo, palette, and product name per organization, one codebase.',
  },
  {
    icon: Webhook,
    title: 'Open API & webhooks',
    desc: 'Build on top of your ledger. Connect Stripe, Salesforce, Shopify, or your own tools.',
  },
  {
    icon: ShieldCheck,
    title: 'Self-hosted or cloud',
    desc: 'Keep every record on your own infrastructure, or let us run it. Same product either way.',
  },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
}

export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Fingerprint className="size-3.5 text-primary" /> Everything in one ledger
        </span>
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Every feature a growing business needs
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          No add-on marketplace, no upsell maze. Bookkeeping, invoicing, payroll and inventory
          ship together — and every plan can be white-labeled or self-hosted.
        </p>
      </div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={container}
        className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            whileHover={{ y: -4 }}
            className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-black/5"
          >
            <div
              aria-hidden
              className="absolute -right-6 -top-6 size-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-150"
            />
            <span className="relative flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <f.icon className="size-5" />
            </span>
            <h3 className="relative mt-4 font-medium">{f.title}</h3>
            <p className="relative mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

const STATS = [
  { icon: Globe2, value: '40+', label: 'countries billed in' },
  { icon: BadgePercent, value: '0%', label: 'payment processing markup' },
  { icon: ShieldCheck, value: '100%', label: 'of data stays on your infra (self-hosted)' },
  { icon: BarChart3, value: '<200ms', label: 'report generation, p95' },
]

export function StatsBand() {
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-8">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.45 }}
            className="text-center"
          >
            <s.icon className="mx-auto size-5 text-primary" />
            <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
