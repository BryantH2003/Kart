import { BROWSE_CATEGORIES } from '@/config/browse-categories'
import { getAllAdapters } from '@/vendors/registry'
import type { SearchResultItem } from '@/types/api.types'

export type BrowseSortBy = 'popular' | 'rating' | 'price_asc' | 'new_releases'

export async function browse(
  slug: string,
  sortBy: BrowseSortBy = 'popular',
  page = 1,
): Promise<SearchResultItem[]> {
  const categoryDef = BROWSE_CATEGORIES.find(c => c.slug === slug)
  if (!categoryDef) throw new Error(`Unknown category: ${slug}`)

  const { productCategory } = categoryDef

  const capable = getAllAdapters().filter(
    a => a.browseableCategories?.includes(productCategory) && typeof a.browse === 'function',
  )

  if (capable.length === 0) {
    throw new Error(`No adapters support browsing category: ${slug}`)
  }

  const settled = await Promise.allSettled(
    capable.map(a => a.browse!({ category: productCategory, sortBy, pageNumber: page })),
  )

  const errors = settled
    .filter((o): o is PromiseRejectedResult => o.status === 'rejected')
    .map(o => String(o.reason))
  if (errors.length > 0) console.error('[browse] adapter errors:', errors)
  if (errors.length === capable.length) {
    throw new Error(`Browse failed: ${errors[0]}`)
  }

  const seen = new Set<string>()
  const items: SearchResultItem[] = []
  for (const outcome of settled) {
    if (outcome.status === 'rejected') continue
    for (const item of outcome.value) {
      const key = `${item.externalIdType}:${item.externalId}`
      if (!seen.has(key)) {
        seen.add(key)
        items.push({
          gameId: item.vendorProductId,
          steamAppId: item.externalId,
          name: item.name,
          cheapestPrice: item.cheapestPrice,
          imageUrl: item.imageUrl ?? '',
        })
      }
    }
  }

  return items
}
