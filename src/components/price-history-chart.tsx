'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PriceHistoryPoint } from '@/types/api.types'

interface PriceHistoryChartProps {
  data: PriceHistoryPoint[]
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`
}

export function PriceHistoryChart({ data }: PriceHistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border/60 bg-card">
        <p className="text-sm text-muted-foreground">No price history available yet.</p>
      </div>
    )
  }

  const prices = data.flatMap((d) => [d.priceMin, d.priceMax])
  const minY = Math.max(0, Math.floor(Math.min(...prices) * 0.9))
  const maxY = Math.ceil(Math.max(...prices) * 1.05)

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Price history (90 days)
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradMin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />

          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minY, maxY]}
            tickFormatter={formatPrice}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={60}
          />

          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatPrice(value),
              name === 'priceAvg' ? 'Avg' : name === 'priceMin' ? 'Low' : 'High',
            ]}
            labelFormatter={formatDate}
          />

          <Area
            type="monotone"
            dataKey="priceMax"
            stroke="hsl(var(--chart-1))"
            strokeWidth={1}
            strokeDasharray="4 2"
            fill="none"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="priceAvg"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            fill="url(#gradAvg)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="priceMin"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            fill="url(#gradMin)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-[hsl(var(--chart-1))]" />
          Avg price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-[hsl(var(--chart-2))]" />
          Low price
        </span>
      </div>
    </div>
  )
}
