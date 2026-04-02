import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before importing the service
vi.mock('@/repositories/cache.repository', () => ({
  hashQuery: vi.fn((q: string) => `hash:${q}`),
  get: vi.fn(),
  set: vi.fn(),
}))

vi.mock('@/vendors/registry', () => ({
  getAllAdapters: vi.fn(),
}))

vi.mock('@/services/matching.service', () => ({
  upsertCanonicalOnly: vi.fn().mockResolvedValue('canonical-uuid'),
  persistVendorData: vi.fn().mockResolvedValue(undefined),
  persistProduct: vi.fn().mockResolvedValue('canonical-uuid'),
}))

import * as cacheRepo from '@/repositories/cache.repository'
import * as registry from '@/vendors/registry'
import { search } from '@/services/search.service'
import type { SearchResult } from '@/vendors/types'

const mockResult: SearchResult = {
  externalId: '8930',
  externalIdType: 'steam_app_id',
  vendorProductId: '61',
  name: 'Civilization V',
  imageUrl: 'https://example.com/civ5.jpg',
  cheapestPrice: 2.99,
  category: 'game',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cacheRepo.get).mockResolvedValue(null)
  vi.mocked(cacheRepo.set).mockResolvedValue(undefined)
  vi.mocked(cacheRepo.hashQuery).mockImplementation((q) => `hash:${q}`)
})

describe('search()', () => {
  it('returns cached results without calling any adapter', async () => {
    const cached = [{ gameId: '61', steamAppId: '8930', name: 'Civ V', cheapestPrice: 2.99, imageUrl: '' }]
    vi.mocked(cacheRepo.get).mockResolvedValue(cached)

    const mockAdapter = { vendorId: 'cheapshark', search: vi.fn(), getProduct: vi.fn() }
    vi.mocked(registry.getAllAdapters).mockReturnValue([mockAdapter])

    const result = await search('civilization')

    expect(result).toEqual(cached)
    expect(mockAdapter.search).not.toHaveBeenCalled()
  })

  it('calls adapter on cache miss and caches result', async () => {
    const mockAdapter = {
      vendorId: 'cheapshark',
      search: vi.fn().mockResolvedValue([mockResult]),
      getProduct: vi.fn(),
    }
    vi.mocked(registry.getAllAdapters).mockReturnValue([mockAdapter])

    const result = await search('civilization')

    expect(mockAdapter.search).toHaveBeenCalledWith('civilization')
    expect(cacheRepo.set).toHaveBeenCalledWith('hash:civilization', result)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Civilization V')
  })

  it('deduplicates results with the same externalId across adapters', async () => {
    const adapter1 = { vendorId: 'cheapshark', search: vi.fn().mockResolvedValue([mockResult]), getProduct: vi.fn() }
    const adapter2 = { vendorId: 'other', search: vi.fn().mockResolvedValue([{ ...mockResult, cheapestPrice: 5.99 }]), getProduct: vi.fn() }
    vi.mocked(registry.getAllAdapters).mockReturnValue([adapter1, adapter2])

    const result = await search('civilization')

    // Only one result — duplicate externalId from adapter2 is dropped
    expect(result).toHaveLength(1)
    expect(result[0].cheapestPrice).toBe(2.99) // first adapter wins
  })

  it('does not crash when an adapter times out', async () => {
    const slowAdapter = {
      vendorId: 'slow',
      search: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([mockResult]), 10000))
      ),
      getProduct: vi.fn(),
    }
    vi.mocked(registry.getAllAdapters).mockReturnValue([slowAdapter])

    vi.useFakeTimers()
    const promise = search('civilization')
    await vi.advanceTimersByTimeAsync(8000)
    const result = await promise
    vi.useRealTimers()

    expect(result).toHaveLength(0) // timed out adapter contributes nothing
  })

  it('returns empty array when all adapters fail', async () => {
    const failingAdapter = {
      vendorId: 'cheapshark',
      search: vi.fn().mockRejectedValue(new Error('network error')),
      getProduct: vi.fn(),
    }
    vi.mocked(registry.getAllAdapters).mockReturnValue([failingAdapter])

    const result = await search('civilization')
    expect(result).toEqual([])
  })
})
