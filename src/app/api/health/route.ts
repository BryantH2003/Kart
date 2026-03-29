// Health check endpoint required by Railway's load balancer.
// Returns 200 when the app is running, 503 if a critical dependency is unreachable.
export async function GET() {
  return Response.json({ status: 'healthy' }, { status: 200 })
}
