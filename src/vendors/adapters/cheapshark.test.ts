import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { CheapSharkAdapter } from './cheapshark'

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_STORES = [
  { storeID: '1', storeName: 'Steam', isActive: 1 },
  { storeID: '7', storeName: 'GOG', isActive: 1 },
  { storeID: '99', storeName: 'Defunct Store', isActive: 0 },
]

const MOCK_GAMES = [
  {
    gameID: '61',
    steamAppID: '8930',
    cheapest: '2.99',
    cheapestDealID: 'abc123',
    external: "Sid Meier's Civilization V",
    internalName: 'SIDMEIERSCIVILIZATIONV',
    thumb: 'https://cdn.example.com/civ5.jpg',
  },
]

const MOCK_DEALS = [
  {
    title: "Sid Meier's Civilization V",
    dealID: 'abc123',
    storeID: '1',
    gameID: '61',
    salePrice: '2.99',
    normalPrice: '29.99',
    isOnSale: '1',
    metacriticScore: '90',
    steamRatingText: 'Overwhelmingly Positive',
    steamRatingPercent: '95',
    steamRatingCount: '77866',
    steamAppID: '8930',
    releaseDate: 1285027200, // 2010-09-21 UTC
    thumb: 'https://cdn.example.com/civ5.jpg',
  },
  {
    title: "Sid Meier's Civilization V",
    dealID: 'def456',
    storeID: '7',
    gameID: '61',
    salePrice: '3.99',
    normalPrice: '29.99',
    isOnSale: '1',
    metacriticScore: '90',
    steamRatingText: 'Overwhelmingly Positive',
    steamRatingPercent: '95',
    steamRatingCount: '77866',
    steamAppID: '8930',
    releaseDate: 1285027200,
    thumb: 'https://cdn.example.com/civ5.jpg',
  },
]

// Browse-mode mock deals: two stores for the same game + one deal with no steamAppID.
// Used to verify deduplication and steamAppID filtering in browse().
const MOCK_BROWSE_DEALS = [
  { ...MOCK_DEALS[0], storeID: '1', salePrice: '2.99' }, // Steam — cheapest, kept
  { ...MOCK_DEALS[0], storeID: '7', salePrice: '3.99' }, // GOG — duplicate steamAppID, dropped
  {
    title: 'DRM-Only Game',
    dealID: 'xyz999',
    storeID: '3',
    gameID: '999',
    salePrice: '5.00',
    normalPrice: '19.99',
    isOnSale: '0',
    metacriticScore: '0',
    // no steamAppID — should be excluded
  },
]

// ── MSW server ────────────────────────────────────────────────────────────────
// MSW intercepts fetch calls at the network layer — the adapter's actual fetch
// executes and MSW returns a controlled response. No fetch mocking or spying.

const server = setupServer(
  http.get('https://www.cheapshark.com/api/1.0/stores', () =>
    HttpResponse.json(MOCK_STORES)
  ),
  http.get('https://www.cheapshark.com/api/1.0/games', ({ request }) => {
    const title = new URL(request.url).searchParams.get('title') ?? ''
    return title.toLowerCase().includes('civilization')
      ? HttpResponse.json(MOCK_GAMES)
      : HttpResponse.json([])
  }),
  http.get('https://www.cheapshark.com/api/1.0/deals', ({ request }) => {
    const url = new URL(request.url)
    const steamAppID = url.searchParams.get('steamAppID') ?? ''
    // When steamAppID is absent this is a browse call — return MOCK_BROWSE_DEALS.
    if (!steamAppID) return HttpResponse.json(MOCK_BROWSE_DEALS)
    return steamAppID === '8930'
      ? HttpResponse.json(MOCK_DEALS)
      : HttpResponse.json([])
  })
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CheapSharkAdapter', () => {
  it('exposes the correct vendorId', () => {
    expect(new CheapSharkAdapter().vendorId).toBe('cheapshark')
  })

  describe('search()', () => {
    it('returns normalized SearchResult for each matching game', async () => {
      const adapter = new CheapSharkAdapter()
      const results = await adapter.search('civilization')
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        externalId: '8930',
        externalIdType: 'steam_app_id',
        vendorProductId: '8930',
        name: "Sid Meier's Civilization V",
        cheapestPrice: 2.99,
        imageUrl: 'https://cdn.example.com/civ5.jpg',
        category: 'game',
      })
    })

    it('returns an empty array when the query matches nothing', async () => {
      const adapter = new CheapSharkAdapter()
      const results = await adapter.search('xyznotarealegame')
      expect(results).toHaveLength(0)
    })

    it('excludes games with steamAppID as empty string', async () => {
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/games', () =>
          HttpResponse.json([
            {
              gameID: '999',
              steamAppID: '', // no Steam presence — docs say empty string
              cheapest: '5.00',
              external: 'DRM-Only Game',
              internalName: 'DRMONLYGAME',
              thumb: '',
            },
          ])
        )
      )
      const adapter = new CheapSharkAdapter()
      const results = await adapter.search('drm only')
      expect(results).toHaveLength(0)
    })

    it('excludes games with steamAppID as null (live API behaviour)', async () => {
      // The live CheapShark API sends null (not "") for non-Steam games.
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/games', () =>
          HttpResponse.json([
            {
              gameID: '999',
              steamAppID: null, // actual live API value
              cheapest: '5.00',
              external: 'DRM-Only Game',
              internalName: 'DRMONLYGAME',
              thumb: '',
            },
          ])
        )
      )
      const adapter = new CheapSharkAdapter()
      const results = await adapter.search('drm only')
      expect(results).toHaveLength(0)
    })
  })

  describe('getProduct()', () => {
    it('returns null when no deals are found for the given vendorProductId', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('00000')
      expect(product).toBeNull()
    })

    it('picks the lowest salePrice across all store deals', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      // MOCK_DEALS has 2.99 (Steam) and 3.99 (GOG) — expect 2.99
      expect(product!.price).toBe(2.99)
    })

    it('normalizes all required fields', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product).toMatchObject({
        externalId: '8930',
        externalIdType: 'steam_app_id',
        vendorProductId: '8930',
        name: "Sid Meier's Civilization V",
        category: 'game',
        metacriticScore: 90,
        originalPrice: 29.99,
        availability: 'in_stock',
        ratingText: 'Overwhelmingly Positive',
        reviewCount: 77866,
      })
    })

    it('normalizes steamRatingPercent (0–100) to a 0–10 rating scale', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      // 95% → 9.5
      expect(product!.rating).toBe(9.5)
    })

    it('converts Unix releaseDate to a JavaScript Date', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product!.releaseDate).toBeInstanceOf(Date)
      expect(product!.releaseDate!.getFullYear()).toBe(2010)
    })

    it('builds a storePrices entry for every deal', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product!.storePrices).toHaveLength(2)
      expect(product!.storePrices![0]).toMatchObject({
        storeId: '1',
        storeName: 'Steam',
        price: 2.99,
        originalPrice: 29.99,
        isOnSale: true,
        dealUrl: expect.stringContaining('cheapshark.com/redirect?dealID=abc123'),
      })
      expect(product!.storePrices![1]).toMatchObject({
        storeId: '7',
        storeName: 'GOG',
        price: 3.99,
      })
    })

    it('falls back to "Store {id}" when a storeID is not in the stores list', async () => {
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', () =>
          HttpResponse.json([{ ...MOCK_DEALS[0], storeID: '42' }])
        )
      )
      // New instance so the store cache is cold
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product!.storePrices![0].storeName).toBe('Store 42')
    })

    it('omits metacriticScore when the value is 0 (unscored)', async () => {
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', () =>
          HttpResponse.json([{ ...MOCK_DEALS[0], metacriticScore: '0' }])
        )
      )
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product!.metacriticScore).toBeUndefined()
    })

    it('omits rating when steamRatingPercent is 0', async () => {
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', () =>
          HttpResponse.json([
            { ...MOCK_DEALS[0], steamRatingPercent: '0', steamRatingCount: '0' },
          ])
        )
      )
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product!.rating).toBeUndefined()
      expect(product!.reviewCount).toBeUndefined()
    })

    it('stores the cheapsharkGameId in metadata', async () => {
      const adapter = new CheapSharkAdapter()
      const product = await adapter.getProduct('8930')
      expect(product!.metadata).toEqual({ cheapsharkGameId: '61' })
    })
  })

  describe('browse()', () => {
    it('declares game as a browseable category', () => {
      expect(new CheapSharkAdapter().browseableCategories).toContain('game')
    })

    it('returns one SearchResult per unique game, deduplicated by steamAppID', async () => {
      const adapter = new CheapSharkAdapter()
      // MOCK_BROWSE_DEALS has 2 rows for steamAppID 8930 + 1 row with no steamAppID
      const results = await adapter.browse({ category: 'game' })
      expect(results).toHaveLength(1)
      expect(results[0].externalId).toBe('8930')
    })

    it('keeps the first (cheapest) deal when deduplicating', async () => {
      const adapter = new CheapSharkAdapter()
      const results = await adapter.browse({ category: 'game' })
      // Steam deal (2.99) comes before GOG deal (3.99) in MOCK_BROWSE_DEALS
      expect(results[0].cheapestPrice).toBe(2.99)
    })

    it('excludes deals with no steamAppID', async () => {
      const adapter = new CheapSharkAdapter()
      const results = await adapter.browse({ category: 'game' })
      expect(results.every(r => r.externalIdType === 'steam_app_id')).toBe(true)
    })

    it('returns normalized SearchResult fields', async () => {
      const adapter = new CheapSharkAdapter()
      const results = await adapter.browse({ category: 'game' })
      expect(results[0]).toMatchObject({
        externalId: '8930',
        externalIdType: 'steam_app_id',
        vendorProductId: '8930',
        name: "Sid Meier's Civilization V",
        imageUrl: 'https://cdn.example.com/civ5.jpg',
        category: 'game',
      })
    })

    it('passes sortBy=DealRating when sort is popular (default)', async () => {
      let capturedUrl = ''
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )
      const adapter = new CheapSharkAdapter()
      await adapter.browse({ category: 'game' })
      expect(capturedUrl).toContain('sortBy=DealRating')
    })

    it('passes sortBy=Metacritic&desc=1 when sort is rating', async () => {
      let capturedUrl = ''
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )
      const adapter = new CheapSharkAdapter()
      await adapter.browse({ category: 'game', sortBy: 'rating' })
      expect(capturedUrl).toContain('sortBy=Metacritic')
      expect(capturedUrl).toContain('desc=1')
    })

    it('passes sortBy=Price&desc=0 when sort is price_asc', async () => {
      let capturedUrl = ''
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )
      const adapter = new CheapSharkAdapter()
      await adapter.browse({ category: 'game', sortBy: 'price_asc' })
      expect(capturedUrl).toContain('sortBy=Price')
      expect(capturedUrl).toContain('desc=0')
    })

    it('passes sortBy=Release&desc=1 when sort is new_releases', async () => {
      let capturedUrl = ''
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )
      const adapter = new CheapSharkAdapter()
      await adapter.browse({ category: 'game', sortBy: 'new_releases' })
      expect(capturedUrl).toContain('sortBy=Release')
      expect(capturedUrl).toContain('desc=1')
    })

    it('converts 1-indexed pageNumber to 0-indexed for CheapShark', async () => {
      let capturedUrl = ''
      server.use(
        http.get('https://www.cheapshark.com/api/1.0/deals', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([])
        })
      )
      const adapter = new CheapSharkAdapter()
      await adapter.browse({ category: 'game', pageNumber: 3 })
      expect(new URL(capturedUrl).searchParams.get('pageNumber')).toBe('2')
    })
  })
})
