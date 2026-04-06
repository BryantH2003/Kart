import * as cacheRepo from '@/repositories/cache.repository'
import { getAllAdapters } from '@/vendors/registry'
import { upsertCanonicalOnly, persistVendorData } from '@/services/matching.service'
import type { SearchResultItem } from '@/types/api.types'

const ADAPTER_TIMEOUT_MS = 7000

// Fan out to all registered adapters with a 7s timeout per adapter.
// Returns deduplicated results — if two adapters return the same steamAppID,
// the first one wins (cheapest price from that adapter).
export async function search(query: string): Promise<SearchResultItem[]> {
  const queryHash = cacheRepo.hashQuery(query)

  const cached = await cacheRepo.get(queryHash)
  if (cached) return cached as SearchResultItem[]

  const adapters = getAllAdapters()

  const results = await Promise.allSettled(
    adapters.map((adapter) =>
      Promise.race([
        adapter.search(query),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${adapter.vendorId} timed out`)), ADAPTER_TIMEOUT_MS)
        ),
      ])
    )
  )

  // Deduplicate by externalId — first adapter result wins.
  const seen = new Set<string>()
  const items: SearchResultItem[] = []

  for (let i = 0; i < results.length; i++) {
    const outcome = results[i]
    if (outcome.status === 'rejected') continue

    const adapter = adapters[i]
    for (const r of outcome.value) {
      const key = `${r.externalIdType}:${r.externalId}`
      if (seen.has(key)) continue
      seen.add(key)

      // Await canonical upsert so we can return canonicalId in results.
      // Fire-and-forget the vendor + snapshot write — it's non-fatal if it fails.
      const normalizedProduct = {
        externalId: r.externalId,
        externalIdType: r.externalIdType,
        name: r.name,
        imageUrl: r.imageUrl,
        category: r.category,
        vendorProductId: r.vendorProductId,
        price: r.cheapestPrice,
        availability: 'in_stock' as const,
      }
      const canonicalId = await upsertCanonicalOnly(normalizedProduct).catch(() => undefined)
      persistVendorData(canonicalId ?? '', adapter.vendorId, normalizedProduct)
        .catch(() => {/* non-fatal */})

      items.push({
        gameId: r.vendorProductId,
        steamAppId: r.externalId,
        name: r.name,
        cheapestPrice: r.cheapestPrice,
        imageUrl: r.imageUrl ?? '',
        canonicalId,
      })
    }
  }

  await cacheRepo.set(queryHash, items).catch(() => {/* non-fatal — stale cache is acceptable */})
  return items
}
