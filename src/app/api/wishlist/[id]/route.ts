import { auth } from '@/lib/auth'
import { updateWishlistSchema } from '@/schemas/wishlist.schema'
import { removeItem, updateTarget } from '@/services/wishlist.service'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth.requireUser()
  const { id } = await params
  await removeItem(user.id, id)
  return new Response(null, { status: 204 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth.requireUser()
  const { id } = await params

  const body = await request.json()
  const parsed = updateWishlistSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await updateTarget(user.id, id, parsed.data.targetPrice)
  return new Response(null, { status: 204 })
}
