import { auth } from '@/lib/auth'
import { recommendSchema } from '@/schemas/recommend.schema'
import { getRecommendation } from '@/services/recommendation.service'

export async function POST(request: Request) {
  await auth.requireUser()

  const body = await request.json()
  const parsed = recommendSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const result = await getRecommendation(parsed.data.vendorProductId, parsed.data.currentPrice)
  return Response.json(result)
}
