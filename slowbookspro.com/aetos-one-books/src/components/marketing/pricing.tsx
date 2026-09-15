'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    name: 'Starter',
    price: '$0',
    period: 'forever',
    desc: 'For freelancers and new businesses getting off spreadsheets.',
    features: ['1 organization', 'Unlimited invoices', 'Bank reconciliation', 'Core reports'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$29',
    period: '/mo',
    desc: 'For growing teams that need payroll, inventory, and API access.',
    features: [
      'Everything in Starter',
      'Payroll & inventory',
      'Open API + webhooks',
      'Multi-currency',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Self-hosted',
    price: '$5,000',
    period: 'one-time',
    desc: 'Full white-label license — run it on your own infrastructure.',
    features: [
      'Everything in Growth',
      'Unlimited organizations',
      'Full white-label branding',
      'Your infrastructure, your data',
      'Source-available license',
    ],
    cta: 'Talk to us',
    highlight: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> Simple pricing
        </span>
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay for the product. Not per seat.
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Unlimited users on every plan. Upgrade when you need payroll and inventory — or go
          self-hosted and own the whole stack outright.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        {PLANS.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ delay: i * 0.1, duration: 0.45 }}
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
                Most popular
              </span>
            )}
            <h3 className="font-medium">{plan.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{plan.period}</span>
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
