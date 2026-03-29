// Next.js 16+ uses proxy.ts instead of middleware.ts.
// The proxy() export replaces middleware(), proxyConfig replaces config.
import { NextRequest } from 'next/server'
import { updateSession } from '@/lib/middleware'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const proxyConfig = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
