import { createClient } from '@/lib/supabase/server'
import type { PriceHistoryPoint } from '@/types/api.types'
import type { NormalizedProduct } from '@/vendors/types'

export async function insertSnapshot(
  vendorProductId: string,
  product: NormalizedProduct
): Promise<void> {
  const supabase = await createClient()

  const storePrices = product.storePrices?.map((s) => ({
    storeId: s.storeId,
    storeName: s.storeName,
    price: s.price,
    dealUrl: s.dealUrl ?? null,
  })) ?? null

  const { error } = await supabase.from('price_snapshots').insert({
    vendor_product_id: vendorProductId,
    price: product.price,
    original_price: product.originalPrice ?? null,
    availability: product.availability,
    rating: product.rating ?? null,
    rating_text: product.ratingText ?? null,
    review_count: product.reviewCount ?? null,
    store_prices: storePrices,
  })

  if (error) throw new Error(`insertSnapshot failed: ${error.message}`)
}

export async function getHistory(
  vendorProductId: string,
  days: number
): Promise<PriceHistoryPoint[]> {
  const supabase = await createClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('price_history_daily')
    .select('date, price_min, price_avg, price_max')
    .eq('vendor_product_id', vendorProductId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) throw new Error(`getHistory failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    date: row.date,
    priceMin: row.price_min ?? 0,
    priceAvg: row.price_avg ?? 0,
    priceMax: row.price_max ?? 0,
  }))
}

export interface LatestSnapshot {
  price: number
  originalPrice: number | null
  availability: string | null
  rating: number | null
  ratingText: string | null
  reviewCount: number | null
  storePrices: unknown
  recordedAt: string | null
}

export async function getLatest(vendorProductId: string): Promise<LatestSnapshot | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('price_snapshots')
    .select('price, original_price, availability, rating, rating_text, review_count, store_prices, recorded_at')
    .eq('vendor_product_id', vendorProductId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    price: data.price,
    originalPrice: data.original_price,
    availability: data.availability,
    rating: data.rating,
    ratingText: data.rating_text,
    reviewCount: data.review_count,
    storePrices: data.store_prices,
    recordedAt: data.recorded_at,
  }
}
