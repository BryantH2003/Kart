import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'
import type { NormalizedProduct } from '@/vendors/types'

type CanonicalProductRow = Database['public']['Tables']['canonical_products']['Row']

// Upsert a canonical product by (external_id_type, external_id).
// Finds an existing record and updates it, or inserts a new one.
// Returns the canonical UUID.
export async function upsertCanonical(product: NormalizedProduct): Promise<string> {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('canonical_products')
    .select('id')
    .eq('external_id_type', product.externalIdType)
    .eq('external_id', product.externalId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('canonical_products')
      .update({
        name: product.name,
        image_url: product.imageUrl ?? null,
        category: product.category ?? null,
        brand: product.brand ?? null,
        release_date: product.releaseDate?.toISOString() ?? null,
        metacritic_score: product.metacriticScore ?? null,
        metadata: (product.metadata ?? null) as Database['public']['Tables']['canonical_products']['Update']['metadata'],
      })
      .eq('id', existing.id)
    return existing.id
  }

  const { data, error } = await supabase
    .from('canonical_products')
    .insert({
      external_id: product.externalId,
      external_id_type: product.externalIdType,
      name: product.name,
      image_url: product.imageUrl ?? null,
      category: product.category ?? null,
      brand: product.brand ?? null,
      release_date: product.releaseDate?.toISOString() ?? null,
      metacritic_score: product.metacriticScore ?? null,
      metadata: (product.metadata ?? null) as Database['public']['Tables']['canonical_products']['Insert']['metadata'],
    })
    .select('id')
    .single()

  if (error) throw new Error(`upsertCanonical failed: ${error.message}`)
  return data.id
}

// Upsert a vendor_products record for the given canonical product.
// Returns the vendor product UUID.
export async function upsertVendorProduct(
  canonicalId: string,
  vendorId: string,
  product: NormalizedProduct
): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('vendor_products')
    .upsert(
      {
        canonical_id: canonicalId,
        vendor_id: vendorId,
        vendor_product_id: product.vendorProductId,
        product_url: product.productUrl ?? null,
        is_active: true,
        sync_status: 'success',
        sync_error: null,
        last_synced: new Date().toISOString(),
      },
      { onConflict: 'vendor_id,vendor_product_id' }
    )
    .select('id')
    .single()

  if (error) throw new Error(`upsertVendorProduct failed: ${error.message}`)
  return data.id
}

export async function findById(id: string): Promise<CanonicalProductRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('canonical_products')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data
}

export async function findByExternalId(
  externalId: string,
  externalIdType: string
): Promise<CanonicalProductRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('canonical_products')
    .select('*')
    .eq('external_id', externalId)
    .eq('external_id_type', externalIdType)
    .maybeSingle()
  return data
}
