import * as productRepo from '@/repositories/product.repository'
import * as priceRepo from '@/repositories/price.repository'
import type { NormalizedProduct } from '@/vendors/types'

// Upserts a canonical product and returns its UUID.
// Fast path — only touches the canonical_products table.
// Called by search.service so results include a usable canonicalId immediately.
export async function upsertCanonicalOnly(
  product: NormalizedProduct
): Promise<string> {
  return productRepo.upsertCanonical(product)
}

// Upserts the vendor listing + inserts a price snapshot for an already-persisted canonical.
// Intended to be called fire-and-forget after the canonical ID has been returned to the caller.
export async function persistVendorData(
  canonicalId: string,
  vendorId: string,
  product: NormalizedProduct
): Promise<void> {
  const vendorProductId = await productRepo.upsertVendorProduct(canonicalId, vendorId, product)
  await priceRepo.insertSnapshot(vendorProductId, product)
}

// Convenience wrapper: upsert canonical + vendor + snapshot in one call.
// Used by the polling job where fire-and-forget is not needed.
export async function persistProduct(
  vendorId: string,
  product: NormalizedProduct
): Promise<string> {
  const canonicalId = await upsertCanonicalOnly(product)
  await persistVendorData(canonicalId, vendorId, product)
  return canonicalId
}
