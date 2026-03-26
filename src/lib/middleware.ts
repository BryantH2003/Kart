import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// In-memory rate limit store (resets on redeploy — upgrade to Upstash for persistence)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  '/api/search':     { max: 20, windowMs: 60_000 },
  '/api/wishlist':   { max: 30, windowMs: 60_000 },
  '/api/alerts':     { max: 10, windowMs: 60_000 },
  '/api/ai':         { max: 10, windowMs: 60_000 },
}

function getRateLimit(pathname: string) {
  for (const [prefix, limit] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(prefix)) return limit
  }
  return null
}

function checkRateLimit(ip: string, pathname: string): boolean {
  const limit = getRateLimit(pathname)
  if (!limit) return true

  const key = `${ip}:${pathname.split('/').slice(0, 3).join('/')}`
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.windowMs })
    return true
  }

  if (entry.count >= limit.max) return false

  entry.count++
  return true
}

export async function updateSession(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!checkRateLimit(ip, request.nextUrl.pathname)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let supabaseResponse = NextResponse.next({ request })

  // Refresh Supabase session on every request so it doesn't expire
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not call supabase.auth.getUser() here for protected routes —
  // that belongs in page/route components. This only refreshes the session token.
  await supabase.auth.getUser()

  return supabaseResponse
}
