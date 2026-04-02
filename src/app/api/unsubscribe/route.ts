import { unsubscribeSchema } from '@/schemas/alert.schema'
import { verifyUnsubToken, unsubscribeUser } from '@/services/alert.service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = unsubscribeSchema.safeParse({
    userId: searchParams.get('userId'),
    token: searchParams.get('token'),
  })

  if (!parsed.success) {
    return Response.json({ error: 'Invalid unsubscribe link' }, { status: 400 })
  }

  const { userId, token } = parsed.data
  if (!verifyUnsubToken(userId, token)) {
    return Response.json({ error: 'Invalid or expired unsubscribe token' }, { status: 403 })
  }

  await unsubscribeUser(userId)
  return Response.json({ message: 'You have been unsubscribed from price alerts.' })
}
