// poll-prices — Supabase Edge Function (Deno)
// Triggered hourly by pg_cron via an HTTP POST from pg_net.
// Fetches current prices for all wishlisted products, persists snapshots,
// and dispatches price-drop alert emails.
//
// Deploy: supabase functions deploy poll-prices
// Secrets required (set via `supabase secrets set`):
//   CRON_SECRET            — verified in Authorization header
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime
//   RESEND_API_KEY
//   RESEND_FROM_EMAIL
//   UNSUBSCRIBE_SECRET     — for generating HMAC unsubscribe tokens

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ── Constants -----------------------------------------------------------------

const BATCH_SIZE = 10
const CHEAPSHARK_BASE = 'https://www.cheapshark.com/api/1.0'
const ALERT_COOLDOWN_HOURS = 24

// ── Types ---------------------------------------------------------------------

interface VendorProductRow {
  id: string
  canonical_id: string
  vendor_id: string
  vendor_product_id: string
  canonical_products: { external_id: string | null; external_id_type: string | null } | null
}

interface CheapSharkDeal {
  storeID: string
  salePrice: string
  normalPrice: string
  dealID: string
  steamRatingPercent: string
  steamRatingText: string
  steamRatingCount: string
  metacriticScore: string
  releaseDate: number
  isOnSale: string
}

// ── Entry point ---------------------------------------------------------------

Deno.serve(async (req) => {
  // Only accept POST (pg_net sends POST)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Verify the cron secret — prevents unauthorized invocations
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── 1. Find all wishlisted canonical products --------------------------------
  const { data: wishlisted, error: wErr } = await supabase
    .from('wishlists')
    .select('canonical_id')

  if (wErr) {
    console.error('Failed to fetch wishlists:', wErr.message)
    return Response.json({ error: wErr.message }, { status: 500 })
  }

  const canonicalIds = [
    ...new Set(
      (wishlisted ?? []).map((w) => w.canonical_id).filter(Boolean) as string[]
    ),
  ]

  if (canonicalIds.length === 0) {
    return Response.json({ polled: 0, errors: 0, message: 'No wishlisted products' })
  }

  // ── 2. Fetch active vendor_products for those canonicals, stalest first ------
  const { data: vendorProducts, error: vpErr } = await supabase
    .from('vendor_products')
    .select('id, canonical_id, vendor_id, vendor_product_id, canonical_products(external_id, external_id_type)')
    .in('canonical_id', canonicalIds)
    .eq('is_active', true)
    .order('last_synced', { ascending: true, nullsFirst: true })

  if (vpErr) {
    console.error('Failed to fetch vendor_products:', vpErr.message)
    return Response.json({ error: vpErr.message }, { status: 500 })
  }

  if (!vendorProducts?.length) {
    return Response.json({ polled: 0, errors: 0, message: 'No active vendor products' })
  }

  // ── 3. Process in batches of 10 --------------------------------------------
  let polled = 0
  let errors = 0

  for (let i = 0; i < vendorProducts.length; i += BATCH_SIZE) {
    const batch = vendorProducts.slice(i, i + BATCH_SIZE) as VendorProductRow[]
    const results = await Promise.allSettled(
      batch.map((vp) => pollProduct(supabase, vp))
    )
    for (const result of results) {
      if (result.status === 'fulfilled') polled++
      else {
        errors++
        console.error('Poll failed:', result.reason)
      }
    }
  }

  console.log(`Poll complete: ${polled} succeeded, ${errors} failed`)
  return Response.json({ polled, errors })
})

// ── Poll a single vendor product ----------------------------------------------

async function pollProduct(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  vp: VendorProductRow
): Promise<void> {
  const steamAppId = vp.canonical_products?.external_id
  if (!steamAppId) {
    throw new Error(`vendor_product ${vp.id} has no steamAppId`)
  }

  // Fetch current deals from CheapShark
  const res = await fetch(
    `${CHEAPSHARK_BASE}/deals?steamAppID=${steamAppId}&pageSize=60`
  )
  if (!res.ok) throw new Error(`CheapShark returned ${res.status} for steamAppID ${steamAppId}`)

  const deals: CheapSharkDeal[] = await res.json()
  if (!deals.length) return

  // Find cheapest price across all deals
  const cheapest = deals.reduce((min, d) =>
    parseFloat(d.salePrice) < parseFloat(min.salePrice) ? d : min
  )
  const price = parseFloat(cheapest.salePrice)
  const originalPrice = parseFloat(cheapest.normalPrice)

  // Build store_prices JSONB
  const storePrices = deals.map((d) => ({
    storeId: d.storeID,
    price: parseFloat(d.salePrice),
    dealUrl: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
  }))

  // Parse optional fields from cheapest deal
  const ratingPercent = parseFloat(cheapest.steamRatingPercent)
  const rating = !isNaN(ratingPercent) && ratingPercent > 0 ? ratingPercent / 10 : null
  const reviewCount = parseInt(cheapest.steamRatingCount)

  // ── Insert price snapshot --------------------------------------------------
  const { error: snapErr } = await supabase.from('price_snapshots').insert({
    vendor_product_id: vp.id,
    price,
    original_price: originalPrice,
    availability: 'in_stock',
    rating,
    rating_text: cheapest.steamRatingText || null,
    review_count: !isNaN(reviewCount) && reviewCount > 0 ? reviewCount : null,
    store_prices: storePrices,
  })

  if (snapErr) throw new Error(`insertSnapshot failed: ${snapErr.message}`)

  // ── Update sync status on vendor_product -----------------------------------
  await supabase
    .from('vendor_products')
    .update({ sync_status: 'success', sync_error: null, last_synced: new Date().toISOString() })
    .eq('id', vp.id)

  // ── Check alert thresholds ------------------------------------------------
  await checkAlerts(supabase, vp.canonical_id, vp.id, price)
}

// ── Alert threshold check ----------------------------------------------------

async function checkAlerts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  canonicalId: string,
  vendorProductId: string,
  currentPrice: number
): Promise<void> {
  // Find wishlist entries for this product that have a target price set
  const { data: rows } = await supabase
    .from('wishlists')
    .select('user_id, target_price')
    .eq('canonical_id', canonicalId)
    .not('target_price', 'is', null)

  if (!rows?.length) return

  const cooloffCutoff = new Date(
    Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000
  ).toISOString()

  for (const row of rows) {
    if (!row.user_id || row.target_price === null) continue
    if (currentPrice > row.target_price) continue

    // Dedup: skip if an alert was already sent within the cooldown window
    const { data: recent } = await supabase
      .from('alerts_sent')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('vendor_product_id', vendorProductId)
      .gte('sent_at', cooloffCutoff)
      .limit(1)
      .maybeSingle()

    if (recent) continue

    await sendAlert(supabase, row.user_id, vendorProductId, canonicalId, currentPrice)
  }
}

// ── Send alert email ----------------------------------------------------------

async function sendAlert(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  vendorProductId: string,
  canonicalId: string,
  triggeredPrice: number
): Promise<void> {
  // Resolve user email via admin API
  const { data: userData } = await supabase.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  if (!email) return

  // Resolve product name
  const { data: canonical } = await supabase
    .from('canonical_products')
    .select('name')
    .eq('id', canonicalId)
    .maybeSingle()
  const productName = canonical?.name ?? 'A product on your wishlist'

  // Generate HMAC unsubscribe token
  const unsubToken = await generateHmac(userId, Deno.env.get('UNSUBSCRIBE_SECRET')!)
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://kart.railway.app'
  const unsubUrl = `${appUrl}/api/unsubscribe?userId=${userId}&token=${unsubToken}`

  // Send email via Resend REST API (no SDK — keeps the function self-contained)
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM_EMAIL'),
      to: email,
      subject: `Price drop: ${productName} is now $${triggeredPrice.toFixed(2)}`,
      html: `
        <p><strong>${productName}</strong> has dropped to <strong>$${triggeredPrice.toFixed(2)}</strong>.</p>
        <p><a href="${unsubUrl}">Unsubscribe from price alerts</a></p>
      `,
    }),
  })

  if (!emailRes.ok) {
    throw new Error(`Resend returned ${emailRes.status}`)
  }

  // Record the alert to enforce the cooldown window
  await supabase.from('alerts_sent').insert({
    user_id: userId,
    vendor_product_id: vendorProductId,
    triggered_price: triggeredPrice,
  })

  console.log(`Alert sent to ${email} for ${productName} at $${triggeredPrice}`)
}

// ── HMAC helper (Web Crypto API — available in Deno) --------------------------

async function generateHmac(userId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(userId))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
