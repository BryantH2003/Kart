'use client'

import { useEffect, useState } from 'react'
import { Zap, TrendingDown, Clock, Minus } from 'lucide-react'
import type { RecommendationResponse } from '@/types/api.types'

interface RecommendationPanelProps {
  canonicalId: string
}

const SIGNAL_CONFIG = {
  buy: {
    icon: TrendingDown,
    label: 'Buy now',
    bgClass: 'bg-accent/10 border-accent/30',
    textClass: 'text-accent',
    iconClass: 'text-accent',
  },
  wait: {
    icon: Clock,
    label: 'Wait',
    bgClass: 'bg-amber-500/10 border-amber-500/30',
    textClass: 'text-amber-500',
    iconClass: 'text-amber-500',
  },
  neutral: {
    icon: Minus,
    label: 'Neutral',
    bgClass: 'bg-muted/60 border-border/60',
    textClass: 'text-muted-foreground',
    iconClass: 'text-muted-foreground',
  },
} as const

export function RecommendationPanel({ canonicalId }: RecommendationPanelProps) {
  const [data, setData] = useState<RecommendationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/ai/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonicalId }),
        })
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError((body as { error?: string }).error ?? 'Could not load recommendation.')
          return
        }
        const result = await res.json()
        setData(result as RecommendationResponse)
      } catch {
        if (!cancelled) setError('Unable to reach the server.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [canonicalId])

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing price trends…</p>
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {error ?? 'Recommendation unavailable — sign in to enable AI analysis.'}
        </p>
      </div>
    )
  }

  const cfg = SIGNAL_CONFIG[data.signal]
  const Icon = cfg.icon

  return (
    <div className={`rounded-xl border p-5 ${cfg.bgClass}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${cfg.iconClass}`} />
        <span className={`font-semibold ${cfg.textClass}`}>{cfg.label}</span>
        <span className="ml-auto text-xs text-muted-foreground">AI-powered</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{data.text}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-background/60 p-3 text-center text-xs">
        <div>
          <p className="text-muted-foreground">Current</p>
          <p className="mt-0.5 font-semibold text-foreground">${data.currentPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">90-day avg</p>
          <p className="mt-0.5 font-semibold text-foreground">${data.avgPrice90d.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">90-day low</p>
          <p className="mt-0.5 font-semibold text-accent">${data.minPrice90d.toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}
