import { getGroqClient } from '@/lib/groq'
import * as priceRepo from '@/repositories/price.repository'
import type { RecommendationResponse } from '@/types/api.types'
import type { PriceHistoryPoint } from '@/types/api.types'

// --- Signal computation -------------------------------------------------------

type Signal = 'buy' | 'wait' | 'neutral'

interface PriceSummary {
  currentPrice: number
  avgPrice90d: number
  minPrice90d: number
  trend: 'down' | 'up' | 'flat'
}

function computeSignal(summary: PriceSummary): Signal {
  const { currentPrice, avgPrice90d, minPrice90d } = summary

  // Buy: current price is ≥20% below 90-day average, or at/near the 90-day low
  if (currentPrice <= avgPrice90d * 0.8 || currentPrice <= minPrice90d * 1.05) return 'buy'

  // Wait: price has been trending downward over the last 3 weeks
  if (summary.trend === 'down') return 'wait'

  return 'neutral'
}

function computeTrend(history: PriceHistoryPoint[]): 'down' | 'up' | 'flat' {
  if (history.length < 21) return 'flat'
  const recent = history.slice(-21)
  const firstAvg = recent.slice(0, 7).reduce((s, p) => s + p.priceAvg, 0) / 7
  const lastAvg = recent.slice(-7).reduce((s, p) => s + p.priceAvg, 0) / 7
  const change = (lastAvg - firstAvg) / firstAvg
  if (change < -0.05) return 'down'
  if (change > 0.05) return 'up'
  return 'flat'
}

// --- Groq narrative -----------------------------------------------------------

const SIGNAL_FALLBACK: Record<Signal, string> = {
  buy: 'This is a good time to buy — the price is significantly below its historical average.',
  wait: 'The price has been trending down recently. Waiting a bit longer may get you a better deal.',
  neutral: 'The price is in line with its historical average. Buy if you want it now, or wait for a sale.',
}

async function getNarrative(signal: Signal, summary: PriceSummary): Promise<string> {
  const prompt = `You are a deal-finder assistant. Given this price data, write exactly 2 sentences advising whether to buy now or wait.
Current price: $${summary.currentPrice.toFixed(2)}
90-day average: $${summary.avgPrice90d.toFixed(2)}
90-day minimum: $${summary.minPrice90d.toFixed(2)}
Price trend (last 3 weeks): ${summary.trend}
Signal: ${signal}`

  try {
    const completion = await getGroqClient().chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.4,
    })
    return completion.choices[0]?.message?.content?.trim() ?? SIGNAL_FALLBACK[signal]
  } catch {
    // Groq unavailable — fall back to rule-based text
    return SIGNAL_FALLBACK[signal]
  }
}

// --- Public API ---------------------------------------------------------------

export async function getRecommendation(
  vendorProductId: string,
  currentPrice: number
): Promise<RecommendationResponse> {
  const history = await priceRepo.getHistory(vendorProductId, 90)

  if (history.length === 0) {
    return {
      signal: 'neutral',
      text: SIGNAL_FALLBACK.neutral,
      currentPrice,
      avgPrice90d: currentPrice,
      minPrice90d: currentPrice,
    }
  }

  const avgPrice90d = history.reduce((s, p) => s + p.priceAvg, 0) / history.length
  const minPrice90d = Math.min(...history.map((p) => p.priceMin))
  const trend = computeTrend(history)
  const summary: PriceSummary = { currentPrice, avgPrice90d, minPrice90d, trend }
  const signal = computeSignal(summary)
  const text = await getNarrative(signal, summary)

  return { signal, text, currentPrice, avgPrice90d, minPrice90d }
}
