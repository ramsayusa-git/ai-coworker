'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Sparkles, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-36 sm:pt-44">
      {/* Ambient gradient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-32 top-0 size-[32rem] rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 24, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-24 top-32 size-[28rem] rounded-full bg-[var(--brand-accent)]/20 blur-3xl"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--background)_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.15] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_10%,transparent_70%)]" />
      </div>

      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          animate="show"
          custom={0}
          variants={fadeUp}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-background/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
        >
          <Sparkles className="size-3.5 text-primary" />
          Self-hosted or cloud — same product, your choice
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          custom={1}
          variants={fadeUp}
          className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl"
        >
          Bookkeeping that stays{' '}
          <span className="bg-gradient-to-r from-primary to-[var(--brand-accent)] bg-clip-text text-transparent">
            yours
          </span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={fadeUp}
          className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground"
        >
          Double-entry bookkeeping, invoicing, payroll and inventory — in one fast, white-label
          platform. Run it in our cloud, or self-host it on your own servers. No lock-in, ever.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          custom={3}
          variants={fadeUp}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button size="lg" className="group h-11 px-6" asChild>
            <Link href="/sign-in">
              Start free — no card required
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-11 px-6" asChild>
            <Link href="#compare">See how we compare</Link>
          </Button>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="show"
          custom={4}
          variants={fadeUp}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
        >
          {['No credit card', 'Import from QuickBooks & Tally', 'Cancel anytime'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-primary" /> {t}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Product preview graphic */}
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto mt-16 max-w-5xl px-4 sm:px-6 lg:px-8"
      >
        <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/10 ring-1 ring-black/5">
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-3">
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 truncate rounded-md bg-background px-3 py-1 text-xs text-muted-foreground">
              app.ledger.app/dashboard
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-4 sm:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium">Net income</p>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="size-3" /> +18.4%
                </span>
              </div>
              <svg viewBox="0 0 300 90" className="h-24 w-full">
                <motion.polyline
                  fill="none"
                  stroke="var(--brand-primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points="0,70 30,60 60,64 90,45 120,50 150,30 180,38 210,20 240,26 270,10 300,16"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.6, delay: 0.9, ease: 'easeInOut' }}
                />
                <motion.polygon
                  points="0,70 30,60 60,64 90,45 120,50 150,30 180,38 210,20 240,26 270,10 300,16 300,90 0,90"
                  fill="var(--brand-primary)"
                  opacity={0.08}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.08 }}
                  transition={{ delay: 1.6, duration: 0.6 }}
                />
              </svg>
              <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                {[
                  ['Revenue', '$84,210'],
                  ['Expenses', '$31,940'],
                  ['Profit', '$52,270'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/50 py-2">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-xl border bg-background p-4">
              <p className="mb-2 text-sm font-medium">Recent invoices</p>
              {[
                ['Acme Retail', '$2,450', 'Paid'],
                ['Nimbus Ltd', '$980', 'Sent'],
                ['Harbor Co', '$5,120', 'Overdue'],
              ].map(([client, amount, status], i) => (
                <motion.div
                  key={client}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + i * 0.12, duration: 0.4 }}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50"
                >
                  <span className="font-medium">{client}</span>
                  <span className="text-muted-foreground">{amount}</span>
                  <span
                    className={
                      status === 'Paid'
                        ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400'
                        : status === 'Overdue'
                          ? 'rounded-full bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-400'
                          : 'rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400'
                    }
                  >
                    {status}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
