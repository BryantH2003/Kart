import { searchQuerySchema } from '@/schemas/search.schema'
import { search } from '@/services/search.service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = searchQuerySchema.safeParse({ q: searchParams.get('q') })

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const results = await search(parsed.data.q)
  return Response.json(results)
}
