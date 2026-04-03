import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/repositories/price.repository', () => ({
  getHistory: vi.fn(),
}))

const mockCreate = vi.fn()
vi.mock('@/lib/groq', () => ({
  getGroqClient: () => ({
    chat: { completions: { create: mockCreate } },
  }),
}))

import * as priceRepo from '@/repositories/price.repository'
import { getRecommendation } from '@/services/recommendation.service'
import type { PriceHistoryPoint } from '@/types/api.types'

function makeHistory(prices: number[]): PriceHistoryPoint[] {
  return prices.map((p, i) => ({
    date: new Date(Date.now() - (prices.length - i) * 86400000).toISOString().split('T')[0],
    priceMin: p * 0.95,
    priceAvg: p,
    priceMax: p * 1.05,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'Groq says buy now.' } }],
  })
})

describe('getRecommendation()', () => {
  it('returns neutral with fallback text when no history exists', async () => {
    vi.mocked(priceRepo.getHistory).mockResolvedValue([])

    const result = await getRecommendation('vp-1', 14.99)

    expect(result.signal).toBe('neutral')
    expect(result.text).toContain('historical average')
  })

  it('returns buy signal when current price is ≥20% below 90d average', async () => {
    // avg = $20, current = $14 (30% below)
    vi.mocked(priceRepo.getHistory).mockResolvedValue(makeHistory(Array(30).fill(20)))

    const result = await getRecommendation('vp-1', 14)
    expect(result.signal).toBe('buy')
  })

  it('returns wait signal when price is trending down', async () => {
    // 21+ days of gradually falling prices — trend = down
    const prices = Array.from({ length: 30 }, (_, i) => 20 - i * 0.3) // 20 → 11.3
    vi.mocked(priceRepo.getHistory).mockResolvedValue(makeHistory(prices))

    // current price slightly above average so buy signal doesn't fire
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    const result = await getRecommendation('vp-1', avg * 0.95)
    expect(result.signal).toBe('wait')
  })

  it('returns neutral when price is average and trend is flat', async () => {
    vi.mocked(priceRepo.getHistory).mockResolvedValue(makeHistory(Array(30).fill(20)))

    const result = await getRecommendation('vp-1', 20)
    expect(result.signal).toBe('neutral')
  })

  it('falls back to rule-based text when Groq throws', async () => {
    vi.mocked(priceRepo.getHistory).mockResolvedValue(makeHistory(Array(30).fill(20)))
    mockCreate.mockRejectedValue(new Error('Groq API error'))

    const result = await getRecommendation('vp-1', 14) // buy signal
    expect(result.signal).toBe('buy')
    expect(result.text).toContain('good time to buy')
  })

  it('uses Groq narrative when available', async () => {
    vi.mocked(priceRepo.getHistory).mockResolvedValue(makeHistory(Array(30).fill(20)))
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Great deal, grab it now!' } }],
    } as never)

    const result = await getRecommendation('vp-1', 14)
    expect(result.text).toBe('Great deal, grab it now!')
  })
})
