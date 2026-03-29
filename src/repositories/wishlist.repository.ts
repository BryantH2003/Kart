import { createClient } from '@/lib/supabase/server'
import type { WishlistItem } from '@/types/api.types'

export async function findByUser(userId: string): Promise<WishlistItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wishlists')
    .select(`
      id,
      canonical_id,
      target_price,
      created_at,
      canonical_products (
        name,
        image_url
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`findByUser failed: ${error.message}`)

  return (data ?? []).map((row) => {
    const product = row.canonical_products as { name: string; image_url: string | null } | null
    return {
      id: row.id,
      canonicalId: row.canonical_id!,
      name: product?.name ?? '',
      imageUrl: product?.image_url ?? null,
      currentPrice: null, // populated by the service layer from the latest price snapshot
      targetPrice: row.target_price,
      createdAt: row.created_at!,
    }
  })
}

export async function insert(
  userId: string,
  canonicalId: string,
  targetPrice: number | null
): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wishlists')
    .insert({ user_id: userId, canonical_id: canonicalId, target_price: targetPrice })
    .select('id')
    .single()

  if (error) throw new Error(`wishlist insert failed: ${error.message}`)
  return data.id
}

// Explicit .eq('user_id') guard in addition to RLS — defense-in-depth against IDOR.
export async function remove(userId: string, wishlistId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('id', wishlistId)
    .eq('user_id', userId)

  if (error) throw new Error(`wishlist delete failed: ${error.message}`)
}

export async function updateTarget(
  userId: string,
  wishlistId: string,
  targetPrice: number | null
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('wishlists')
    .update({ target_price: targetPrice })
    .eq('id', wishlistId)
    .eq('user_id', userId)

  if (error) throw new Error(`updateTarget failed: ${error.message}`)
}

export interface TrackedVendorProduct {
  vendorProductId: string
  canonicalId: string
  vendorId: string
}

// Returns all active vendor_products whose canonical product appears on any wishlist.
// Used by the polling job to determine what prices need refreshing.
export async function getTrackedVendorProducts(): Promise<TrackedVendorProduct[]> {
  const supabase = await createClient()

  // Step 1: collect all wishlisted canonical_ids
  const { data: wishlisted, error: wError } = await supabase
    .from('wishlists')
    .select('canonical_id')

  if (wError) throw new Error(`getTrackedVendorProducts failed: ${wError.message}`)

  const canonicalIds = [
    ...new Set(
      (wishlisted ?? []).map((w) => w.canonical_id).filter((id): id is string => id !== null)
    ),
  ]

  if (canonicalIds.length === 0) return []

  // Step 2: find active vendor_products for those canonical_ids, stalest first
  const { data, error } = await supabase
    .from('vendor_products')
    .select('id, canonical_id, vendor_id')
    .in('canonical_id', canonicalIds)
    .eq('is_active', true)
    .order('last_synced', { ascending: true, nullsFirst: true })

  if (error) throw new Error(`getTrackedVendorProducts failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    vendorProductId: row.id,
    canonicalId: row.canonical_id!,
    vendorId: row.vendor_id!,
  }))
}
