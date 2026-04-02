import * as wishlistRepo from '@/repositories/wishlist.repository'
import * as priceRepo from '@/repositories/price.repository'
import { createClient } from '@/lib/supabase/server'
import type { WishlistItem } from '@/types/api.types'

export async function getUserWishlist(userId: string): Promise<WishlistItem[]> {
  const items = await wishlistRepo.findByUser(userId)

  // Hydrate currentPrice from the latest price snapshot for each item
  const hydrated = await Promise.all(
    items.map(async (item) => {
      const supabase = await createClient()
      const { data: vp } = await supabase
        .from('vendor_products')
        .select('id')
        .eq('canonical_id', item.canonicalId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (!vp) return item
      const latest = await priceRepo.getLatest(vp.id)
      return { ...item, currentPrice: latest?.price ?? null }
    })
  )

  return hydrated
}

export async function addItem(
  userId: string,
  canonicalId: string,
  targetPrice: number | null
): Promise<string> {
  // Duplicate check — the DB has a UNIQUE(user_id, canonical_id) constraint,
  // but we surface a cleaner error here rather than letting the DB throw.
  const existing = await wishlistRepo.findByUser(userId)
  if (existing.some((item) => item.canonicalId === canonicalId)) {
    throw new Error('Item already on wishlist')
  }
  return wishlistRepo.insert(userId, canonicalId, targetPrice)
}

export async function removeItem(userId: string, wishlistId: string): Promise<void> {
  // Repository already enforces .eq('user_id') — ownership validated at DB level.
  return wishlistRepo.remove(userId, wishlistId)
}

export async function updateTarget(
  userId: string,
  wishlistId: string,
  targetPrice: number | null
): Promise<void> {
  return wishlistRepo.updateTarget(userId, wishlistId, targetPrice)
}
