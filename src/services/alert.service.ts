import crypto from 'crypto'
import { resend } from '@/lib/resend'
import { createClient } from '@/lib/supabase/server'
import type { TrackedVendorProduct } from '@/repositories/wishlist.repository'

const ALERT_COOLDOWN_HOURS = 24

// --- HMAC token helpers -------------------------------------------------------

export function generateUnsubToken(userId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET!
  return crypto.createHmac('sha256', secret).update(userId).digest('hex')
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  const expected = generateUnsubToken(userId)
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
}

// --- Threshold check ----------------------------------------------------------

// Checks whether a price drop alert should be sent for the given vendor product.
// Skips if: price is above target, or an alert was already sent within the cooldown window.
export async function checkAndSendAlert(
  tracked: TrackedVendorProduct,
  currentPrice: number
): Promise<void> {
  const supabase = await createClient()

  // Find all wishlist entries for this canonical product that have a target price
  const { data: wishlistRows, error: wError } = await supabase
    .from('wishlists')
    .select('user_id, target_price')
    .eq('canonical_id', tracked.canonicalId)
    .not('target_price', 'is', null)

  if (wError) throw new Error(`alert checkAndSendAlert wishlists: ${wError.message}`)
  if (!wishlistRows?.length) return

  const cooloffCutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()

  for (const row of wishlistRows) {
    if (!row.user_id || row.target_price === null) continue
    if (currentPrice > row.target_price) continue

    // Deduplication: skip if an alert was already sent within the cooldown window
    const { data: recent } = await supabase
      .from('alerts_sent')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('vendor_product_id', tracked.vendorProductId)
      .gte('sent_at', cooloffCutoff)
      .limit(1)
      .maybeSingle()

    if (recent) continue

    await sendAlertEmail(row.user_id, tracked.vendorProductId, currentPrice)
  }
}

async function sendAlertEmail(
  userId: string,
  vendorProductId: string,
  triggeredPrice: number
): Promise<void> {
  const supabase = await createClient()

  // Resolve user email
  const { data: userData } = await supabase.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  if (!email) return

  // Resolve product name
  const { data: vp } = await supabase
    .from('vendor_products')
    .select('canonical_products(name)')
    .eq('id', vendorProductId)
    .maybeSingle()

  const productName = (vp?.canonical_products as { name: string } | null)?.name ?? 'A product'
  const unsubToken = generateUnsubToken(userId)
  const unsubUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'railway.app')}/api/unsubscribe?userId=${userId}&token=${unsubToken}`

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: `Price drop: ${productName} is now $${triggeredPrice.toFixed(2)}`,
    html: `
      <p><strong>${productName}</strong> has dropped to <strong>$${triggeredPrice.toFixed(2)}</strong>.</p>
      <p><a href="${unsubUrl}">Unsubscribe from price alerts</a></p>
    `,
  })

  // Record the alert so we don't resend within the cooldown window
  await supabase.from('alerts_sent').insert({
    user_id: userId,
    vendor_product_id: vendorProductId,
    triggered_price: triggeredPrice,
  })
}
