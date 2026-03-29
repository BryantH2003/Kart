import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'

const TTL_MINUTES = 30

// SHA-256 hash of the normalized query string — used as the cache primary key.
export function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex')
}

// Returns cached results if they exist and are within the 30-minute TTL, otherwise null.
export async function get(queryHash: string): Promise<unknown | null> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('search_cache')
    .select('results, cached_at')
    .eq('query_hash', queryHash)
    .gte('cached_at', cutoff)
    .maybeSingle()

  return data?.results ?? null
}

// Upserts a cache entry, resetting cached_at so the TTL window restarts.
export async function set(queryHash: string, results: unknown): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('search_cache')
    .upsert(
      {
        query_hash: queryHash,
        results: results as Json,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'query_hash' }
    )

  if (error) throw new Error(`cache set failed: ${error.message}`)
}
