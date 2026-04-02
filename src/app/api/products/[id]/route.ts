import { getProductPage } from '@/services/product.service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return Response.json({ error: 'Product ID is required' }, { status: 400 })
  }

  const product = await getProductPage(id)
  if (!product) {
    return Response.json({ error: 'Product not found' }, { status: 404 })
  }

  return Response.json(product)
}
