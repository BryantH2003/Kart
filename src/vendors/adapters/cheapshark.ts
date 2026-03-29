import { z } from 'zod'
import type { VendorAdapter, SearchResult, NormalizedProduct, VendorStorePrice } from '../types'

const BASE_URL = 'https://www.cheapshark.com/api/1.0'

// ── Zod schemas for raw API responses ────────────────────────────────────────
// CheapShark returns all numeric values as strings except releaseDate (Unix int).

const GameSchema = z.object({
  gameID: z.string(),
  steamAppID: z.string().nullable(),  // null or "" when game has no Steam presence
  cheapest: z.string(),
  cheapestDealID: z.string().optional(),
  external: z.string(),    // game title
  internalName: z.string(),
  thumb: z.string().optional(),
})
const GamesResponseSchema = z.array(GameSchema)

const DealSchema = z.object({
  title: z.string(),
  dealID: z.string(),
  storeID: z.string(),
  gameID: z.string(),
  salePrice: z.string(),
  normalPrice: z.string(),
  isOnSale: z.string(),        // "0" or "1"
  metacriticScore: z.string(), // "0" when unscored
  steamRatingText: z.string().optional(),
  steamRatingPercent: z.string().optional(),
  steamRatingCount: z.string().optional(),
  steamAppID: z.string().optional(),
  releaseDate: z.number().optional(), // Unix timestamp (seconds)
  thumb: z.string().optional(),
  dealRating: z.string().optional(),
  lastChange: z.number().optional(),
})
const DealsResponseSchema = z.array(DealSchema)

const StoreSchema = z.object({
  storeID: z.string(),
  storeName: z.string(),
  isActive: z.number(), // 1 = active, 0 = inactive
})
const StoresResponseSchema = z.array(StoreSchema)

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CheapSharkAdapter implements VendorAdapter {
  readonly vendorId = 'cheapshark'

  // Cache the in-flight Promise (not the resolved Map) so concurrent callers
  // all await the same fetch rather than each issuing their own /stores request.
  // Reset to null on failure so the next call retries.
  private storeNamesPromise: Promise<Map<string, string>> | null = null

  private fetchStoreNames(): Promise<Map<string, string>> {
    if (!this.storeNamesPromise) {
      this.storeNamesPromise = fetch(`${BASE_URL}/stores`)
        .then(res => {
          if (!res.ok) throw new Error(`CheapShark /stores returned ${res.status}`)
          return res.json()
        })
        .then((json: unknown) => {
          const stores = StoresResponseSchema.parse(json)
          return new Map(
            stores.filter(s => s.isActive === 1).map(s => [s.storeID, s.storeName])
          )
        })
        .catch(err => {
          // Don't cache the rejection — let the next caller retry.
          this.storeNamesPromise = null
          throw err
        })
    }
    return this.storeNamesPromise
  }

  async search(query: string): Promise<SearchResult[]> {
    const url = `${BASE_URL}/games?title=${encodeURIComponent(query)}&limit=20`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`CheapShark /games returned ${res.status}`)
    const games = GamesResponseSchema.parse(await res.json())

    return games
      .filter((g): g is typeof g & { steamAppID: string } => !!g.steamAppID && g.cheapest !== '')
      .map(g => ({
        externalId: g.steamAppID,
        externalIdType: 'steam_app_id' as const,
        // vendorProductId = steamAppID because /deals?steamAppID= is how we fetch deals.
        // For CheapShark these are the same value; for other vendors they may differ.
        vendorProductId: g.steamAppID,
        name: g.external,
        imageUrl: g.thumb || undefined,
        cheapestPrice: parseFloat(g.cheapest),
        category: 'game' as const,
      }))
  }

  async getProduct(vendorProductId: string): Promise<NormalizedProduct | null> {
    const url = `${BASE_URL}/deals?steamAppID=${encodeURIComponent(vendorProductId)}&pageSize=60`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`CheapShark /deals returned ${res.status}`)
    const deals = DealsResponseSchema.parse(await res.json())

    if (deals.length === 0) return null

    const storeNames = await this.fetchStoreNames()

    // Single pass: build storePrices and find the cheapest deal simultaneously.
    // Parsing salePrice/normalPrice once per deal avoids redundant parseFloat calls.
    let cheapestPrice = Infinity
    let cheapestIdx = 0
    const storePrices: VendorStorePrice[] = deals.map((d, i) => {
      const salePrice = parseFloat(d.salePrice)
      const normalPrice = parseFloat(d.normalPrice)
      if (salePrice < cheapestPrice) {
        cheapestPrice = salePrice
        cheapestIdx = i
      }
      return {
        storeId: d.storeID,
        storeName: storeNames.get(d.storeID) ?? `Store ${d.storeID}`,
        price: salePrice,
        originalPrice: normalPrice,
        // CheapShark exposes a redirect URL per deal — not a direct store link.
        dealUrl: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
        isOnSale: d.isOnSale === '1',
      }
    })

    const cheapest = storePrices[cheapestIdx]

    // Game-level metadata (Metacritic score, Steam rating) is consistent across
    // all deal rows for the same game — CheapShark duplicates it on every row.
    const ref = deals[0]
    const metacritic = parseInt(ref.metacriticScore, 10)
    const ratingPercent = ref.steamRatingPercent
      ? parseInt(ref.steamRatingPercent, 10)
      : undefined
    const reviewCount = ref.steamRatingCount
      ? parseInt(ref.steamRatingCount, 10)
      : undefined

    return {
      externalId: vendorProductId,
      externalIdType: 'steam_app_id',
      name: ref.title,
      imageUrl: ref.thumb || undefined,
      category: 'game',
      releaseDate: ref.releaseDate ? new Date(ref.releaseDate * 1000) : undefined,
      // metacriticScore of 0 means unscored in CheapShark — omit rather than store 0.
      metacriticScore: metacritic > 0 ? metacritic : undefined,
      // CheapShark's gameID differs from steamAppID — preserve it for debugging
      // and any future CheapShark-specific lookups.
      metadata: { cheapsharkGameId: ref.gameID },

      vendorProductId,
      // No product page URL — CheapShark is an aggregator. Per-store links are
      // in storePrices[].dealUrl.

      price: cheapest.price,
      originalPrice: cheapest.originalPrice,
      // CheapShark only returns in-stock deals — no availability signal in the API.
      availability: 'in_stock',
      // Steam rating is a percentage (0–100); normalize to 0–10 to match our schema.
      rating: ratingPercent && ratingPercent > 0 ? ratingPercent / 10 : undefined,
      ratingText: ref.steamRatingText || undefined,
      reviewCount: reviewCount && reviewCount > 0 ? reviewCount : undefined,
      storePrices,
    }
  }
}
