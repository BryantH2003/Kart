// Vendor adapter interface and shared output types.
// All adapters return these shapes — vendor-specific data stays in metadata fields.

// Known external ID namespaces. Add here when a new product category requires
// a new identifier type (e.g. 'asin' when adding Amazon).
export type ExternalIdType = 'steam_app_id' | 'upc' | 'gtin' | 'asin' | 'isbn'

// Known product categories. Extend when onboarding a new category of goods.
export type ProductCategory = 'game' | 'software' | 'dlc' | 'hardware'

// Renamed VendorStorePrice (vs. the api.types.ts StorePrice which is the public
// API shape). This internal type is richer — it carries isOnSale and originalPrice
// which are collapsed or omitted in the public response.
export interface VendorStorePrice {
  storeId: string
  storeName: string
  price: number
  originalPrice?: number
  // The link to this deal. For aggregators (CheapShark) this is a redirect URL;
  // for direct retailers it will be the product page. Adapters document their format.
  dealUrl?: string
  isOnSale: boolean
}

// Returned by adapter.search() — enough to render a search result card and
// identify the product for a subsequent getProduct() call.
export interface SearchResult {
  // externalId + externalIdType identify the canonical product record.
  // vendorProductId is the ID passed back to getProduct() — for CheapShark it
  // equals externalId (both are the Steam App ID), but for vendors whose internal
  // ID differs from the canonical ID they will diverge.
  externalId: string
  externalIdType: ExternalIdType
  vendorProductId: string
  name: string
  imageUrl?: string
  cheapestPrice: number
  category?: ProductCategory
}

// Returned by adapter.getProduct() — maps directly to canonical_products +
// vendor_products + a price_snapshots row.
export interface NormalizedProduct {
  // ── canonical_products ──────────────────────────────────────────────────────
  externalId: string
  externalIdType: ExternalIdType
  name: string
  imageUrl?: string
  category?: ProductCategory
  brand?: string
  releaseDate?: Date
  metacriticScore?: number
  // Category-specific extras that don't warrant a permanent column go here.
  // Example: { genres: ['Strategy', 'Turn-Based'] }
  metadata?: Record<string, unknown>

  // ── vendor_products ─────────────────────────────────────────────────────────
  vendorProductId: string
  productUrl?: string  // omit for aggregators — per-store URLs live in storePrices

  // ── price_snapshots ─────────────────────────────────────────────────────────
  price: number           // cheapest current price across all stores
  originalPrice?: number
  availability: 'in_stock' | 'out_of_stock' | 'limited' | 'pre_order'
  rating?: number         // normalized 0–10 across all vendors
  ratingText?: string     // human-readable label, e.g. "Overwhelmingly Positive"
  reviewCount?: number
  storePrices?: VendorStorePrice[]
}

export interface VendorAdapter {
  readonly vendorId: string
  search(query: string): Promise<SearchResult[]>
  getProduct(vendorProductId: string): Promise<NormalizedProduct | null>
}
