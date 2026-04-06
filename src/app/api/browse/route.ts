import { browseQuerySchema } from '@/schemas/browse.schema'
import { browse } from '@/services/browse.service'
import type { BrowseSortBy } from '@/services/browse.service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = browseQuerySchema.safeParse({
    category: searchParams.get('category'),
    sortBy: searchParams.get('sortBy') ?? undefined,
    page: searchParams.get('page') ?? undefined,
  })

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { category: slug, sortBy, page } = parsed.data

  try {
    const items = await browse(slug, sortBy as BrowseSortBy, page)
    return Response.json(items)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('No adapters')) return Response.json({ error: msg }, { status: 404 })
    if (msg.startsWith('Browse failed')) return Response.json({ error: msg }, { status: 502 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
