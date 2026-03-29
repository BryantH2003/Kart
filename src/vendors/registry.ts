// Vendor registry — the ONLY file that changes when onboarding a new vendor.
// Services and the polling job discover adapters through this registry.
// They never import an adapter directly.
//
// To add a new vendor:
//   1. Write src/vendors/adapters/<vendor>.ts implementing VendorAdapter
//   2. Add one import and one Map entry below
//   3. INSERT one row into the vendors table (see PLAN.md → Adding a New Vendor)

import type { VendorAdapter } from './types'
import { CheapSharkAdapter } from './adapters/cheapshark'

const registry = new Map<string, VendorAdapter>([
  ['cheapshark', new CheapSharkAdapter()],
  // ['ebay', new EbayAdapter()],       ← future vendors go here
  // ['bestbuy', new BestBuyAdapter()],
])

// Cached once at module init — registry is static for the lifetime of the process.
const allAdapters: VendorAdapter[] = Array.from(registry.values())

export function getAdapter(vendorId: string): VendorAdapter | undefined {
  return registry.get(vendorId)
}

// Returns every registered adapter — used by the search service to fan out
// a single query across all active vendors simultaneously.
export function getAllAdapters(): VendorAdapter[] {
  return allAdapters
}
