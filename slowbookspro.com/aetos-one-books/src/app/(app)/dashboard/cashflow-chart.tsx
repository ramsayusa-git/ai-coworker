'use client'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

type Point = { month: string; income: number; expense: number; net: number }

/** Twelve months of income against expense. Currency, not counts. */
export function CashflowChart({ data, currency }: { data: Point[]; currency: string }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: Math.abs(v) >= 10_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(v) >= 10_000 ? 1 : 0,
    }).format(v)

  const label = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="expense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={label}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          />
          <YAxis
            tickFormatter={fmt}
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          />
          <Tooltip
            formatter={((value: unknown, name: unknown) => [
              fmt(Number(value ?? 0)),
              name === 'income' ? 'Income' : 'Expense',
            ]) as never}
            labelFormatter={((m: unknown) =>
              new Date(`${String(m)}-01T00:00:00Z`).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })) as never}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#income)"
          />
          <Area
            type="monotone"
            dataKey="expense"
            stroke="var(--chart-5)"
            strokeWidth={2}
            fill="url(#expense)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
