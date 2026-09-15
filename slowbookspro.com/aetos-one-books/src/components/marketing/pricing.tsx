'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Building2, Check, Cloud, Handshake, Server, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    name: 'Cloud',
    icon: Cloud,
    price: '$0',
    period: 'to start',
    desc: 'We host it. Unlimited users, upgrade as you grow — starts free.',
    features: ['Managed hosting & backups', 'Automatic updates', 'Unlimited invoices', 'From $29/mo for payroll + inventory'],
    cta: 'Start free',
    highlight: true,
  },
  {
    name: 'Self-hosted',
    icon: Server,
    price: '$5,000',
    period: 'one-time license',
    desc: 'Download and run it yourself, on any server you control.',
    features: ['Perpetual license, no subscription', 'Full source access', 'Your infrastructure, your backups', 'Community + email support'],
    cta: 'Get the license',
    highlight: false,
  },
  {
    name: 'On-premises',
    icon: Building2,
    price: 'Custom',
    period: 'enterprise',
    desc: 'Installed and supported inside your own data center or private cloud.',
    features: ['Dedicated install & migration team', 'SLA-backed support', 'Air-gapped / private network ready', 'Compliance & audit assistance'],
    cta: 'Talk to sales',
    highlight: false,
  },
  {
    name: 'White-label reseller',
    icon: Handshake,
    price: '30–50%',
    period: 'revenue share',
    desc: 'Resell Ledger under your own brand — cloud, self-hosted, or both.',
    features: ['Your logo, palette & domain', 'No per-customer rebuild', 'Reseller dashboard & billing', 'Partner support channel'],
    cta: 'Become a partner',
    highlight: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> Four ways to run it
        </span>
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Cloud, self-hosted, on-premises, or white-labeled
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Same product, four deployment models. Start in our cloud, move to your own servers
          later, or resell it under your own brand — your data and your choice, always.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ delay: i * 0.08, duration: 0.45 }}
            whileHover={{ y: -4 }}
            className={cn(
              'relative flex flex-col rounded-2xl border p-6',
              plan.highlight
                ? 'border-primary bg-primary/[0.04] shadow-lg shadow-primary/10 ring-1 ring-primary/20'
                : 'bg-card',
            )}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Fastest start
              </span>
            )}
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <plan.icon className="size-4.5" />
            </span>
            <h3 className="mt-3 font-medium">{plan.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tracking-tight">{plan.price}</span>
              <span className="text-xs text-muted-foreground">{plan.period}</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{plan.desc}</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
                </li>
              ))}
            </ul>
            <Button className="mt-6" variant={plan.highlight ? 'default' : 'outline'} asChild>
              <Link href="/sign-in">{plan.cta}</Link>
            </Button>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
