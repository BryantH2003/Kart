import * as productRepo from '@/repositories/product.repository'
import * as priceRepo from '@/repositories/price.repository'
import { createClient } from '@/lib/supabase/server'
import type { ProductPageData, VendorPriceData } from '@/types/api.types'

// Assembles everything the product detail page needs:
// canonical metadata + per-vendor latest prices + 90-day price history.
// Accepts either a canonical UUID or a steamAppId — tries UUID first, falls back
// to external_id lookup so the frontend can link directly from search results.
export async function getProductPage(id: string): Promise<ProductPageData | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const canonical = isUuid
    ? await productRepo.findById(id)
    : await productRepo.findByExternalId(id, 'steam_app_id')

  if (!canonical) return null
  const canonicalId = canonical.id

  // Fetch all active vendor listings for this product
  const supabase = await createClient()
  const { data: vendorRows, error } = await supabase
    .from('vendor_products')
    .select('id, vendor_id, product_url, last_synced, vendors(name)')
    .eq('canonical_id', canonicalId)
    .eq('is_active', true)

  if (error) throw new Error(`getProductPage vendors failed: ${error.message}`)

  // For each vendor product, get the latest price snapshot and 90-day history
  const [vendorResults, historyResults] = await Promise.all([
    Promise.all(
      (vendorRows ?? []).map(async (row): Promise<VendorPriceData | null> => {
        const latest = await priceRepo.getLatest(row.id)
        if (!latest) return null
        const vendor = row.vendors as { name: string } | null
        return {
          vendorId: row.vendor_id!,
          vendorName: vendor?.name ?? row.vendor_id!,
          price: latest.price,
          originalPrice: latest.originalPrice,
          productUrl: row.product_url,
          storePrices: Array.isArray(latest.storePrices) ? latest.storePrices as VendorPriceData['storePrices'] : [],
          lastSynced: row.last_synced,
        }
      })
    ),
    // Use the first vendor product for history (all vendors share canonical price history)
    vendorRows?.[0]
      ? priceRepo.getHistory(vendorRows[0].id, 90)
      : Promise.resolve([]),
  ])

  const vendors = vendorResults.filter((v): v is VendorPriceData => v !== null)

  return {
    id: canonical.id,
    name: canonical.name,
    imageUrl: canonical.image_url,
    releaseDate: canonical.release_date,
    metacriticScore: canonical.metacritic_score,
    ratingText: null,  // populated from latest snapshot if needed
    rating: null,
    reviewCount: null,
    vendors,
    priceHistory: historyResults,
  }
}
