import { browseQuerySchema } from '@/schemas/browse.schema'
import { BROWSE_CATEGORIES } from '@/config/browse-categories'
import { getAllAdapters } from '@/vendors/registry'
import type { SearchResultItem } from '@/types/api.types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = browseQuerySchema.safeParse({
    category: searchParams.get('category'),
    sortBy: searchParams.get('sortBy') ?? undefined,
    page: searchParams.get('page') ?? undefined,
  })

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { category: slug, sortBy, page } = parsed.data
  const categoryDef = BROWSE_CATEGORIES.find(c => c.slug === slug)!
  const { productCategory } = categoryDef

  // Fan out to all adapters that declare support for this category.
  const capable = getAllAdapters().filter(
    a => a.browseableCategories?.includes(productCategory) && typeof a.browse === 'function'
  )

  if (capable.length === 0) {
    return Response.json({ error: `No adapters support browsing category: ${slug}` }, { status: 404 })
  }

  const settled = await Promise.allSettled(
    capable.map(a => a.browse!({ category: productCategory, sortBy, pageNumber: page }))
  )

  // Surface adapter errors so callers can diagnose failures rather than seeing an empty grid.
  const errors = settled
    .filter((o): o is PromiseRejectedResult => o.status === 'rejected')
    .map(o => String(o.reason))
  if (errors.length > 0) console.error('[browse] adapter errors:', errors)
  if (errors.length === capable.length) {
    return Response.json({ error: `Browse failed: ${errors[0]}` }, { status: 502 })
  }

  // Merge results, deduplicate by (externalIdType, externalId),
  // then map to SearchResultItem — the shape ProductCard expects.
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

  return Response.json(items)
}
