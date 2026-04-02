import * as productRepo from '@/repositories/product.repository'
import * as priceRepo from '@/repositories/price.repository'
import type { NormalizedProduct } from '@/vendors/types'

// Upserts a canonical product + its vendor listing + an initial price snapshot.
// Called by search.service after fetching fresh data from a vendor adapter.
// Returns the canonical UUID.
export async function persistProduct(
  vendorId: string,
  product: NormalizedProduct
): Promise<string> {
  const canonicalId = await productRepo.upsertCanonical(product)
  const vendorProductId = await productRepo.upsertVendorProduct(canonicalId, vendorId, product)
  await priceRepo.insertSnapshot(vendorProductId, product)
  return canonicalId
}
