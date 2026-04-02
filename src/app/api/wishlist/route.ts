import { auth } from '@/lib/auth'
import { addWishlistSchema } from '@/schemas/wishlist.schema'
import { getUserWishlist, addItem } from '@/services/wishlist.service'

export async function GET() {
  const user = await auth.requireUser()
  const items = await getUserWishlist(user.id)
  return Response.json(items)
}

export async function POST(request: Request) {
  const user = await auth.requireUser()

  const body = await request.json()
  const parsed = addWishlistSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  try {
    const id = await addItem(user.id, parsed.data.canonicalId, parsed.data.targetPrice ?? null)
    return Response.json({ id }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add item'
    return Response.json({ error: message }, { status: 409 })
  }
}
