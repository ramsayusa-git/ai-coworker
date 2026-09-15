'use client'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * The analytics charts.
 *
 * Every series is named in a legend and repeated in the table underneath, so
 * the colour is decoration and never the only carrier of meaning. Axis and
 * tooltip figures use the org's currency with tabular digits, and the palette
 * is the theme's --chart-1..6 so a white-labelled install recolours with it.
 */

type Currency = { currency: string }

const formatter = (currency: string, compact = true) => (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: compact && Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: compact && Math.abs(value) >= 10_000 ? 1 : 0,
  }).format(value)

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }

const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)',
}

export type TrendPoint = {
  month: string
  label: string
  invoiced: number
  collected: number
  expenses: number
}

export function RevenueTrendChart({ data, currency }: { data: TrendPoint[] } & Currency) {
  const fmt = formatter(currency)
  return (
    <div className="h-72 w-full" role="img" aria-label="Invoiced, collected and expenses by month for the last twelve months">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={68} tick={axisTick} />
          <Tooltip
            formatter={((value: unknown, name: unknown) => [fmt(Number(value ?? 0)), String(name)]) as never}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="invoiced" name="Invoiced" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" name="Expenses" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="collected"
            name="Collected"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export type ForecastPoint = {
  date: string
  label: string
  collections: number
  payments: number
  net: number
  cash: number
}

export function CashForecastChart({ data, currency }: { data: ForecastPoint[] } & Currency) {
  const fmt = formatter(currency)
  return (
    <div
      className="h-72 w-full"
      role="img"
      aria-label="Projected cash over the next ninety days, cumulative by week"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="forecast-cash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={68} tick={axisTick} />
          <Tooltip
            formatter={((value: unknown, name: unknown) => [fmt(Number(value ?? 0)), String(name)]) as never}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="cash"
            name="Projected cash"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#forecast-cash)"
          />
          <Line
            type="monotone"
            dataKey="collections"
            name="Cumulative collections"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="payments"
            name="Cumulative payments"
            stroke="var(--chart-5)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export type RankedRow = { id: number; name: string; value: number; share: number }

const SLICES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

export function RankedBarChart({
  data,
  currency,
  label,
}: { data: RankedRow[]; label: string } & Currency) {
  const fmt = formatter(currency)
  return (
    <div className="h-72 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={fmt}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            formatter={((value: unknown) => [fmt(Number(value ?? 0)), 'Amount']) as never}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'var(--muted)' }}
          />
          <Bar dataKey="value" name="Amount" radius={[0, 3, 3, 0]}>
            {data.map((row, index) => (
              <Cell key={row.id} fill={SLICES[index % SLICES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
