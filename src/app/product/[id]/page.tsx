import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Star } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { VendorComparisonTable } from '@/components/vendor-comparison-table'
import { PriceHistoryChart } from '@/components/price-history-chart'
import { WishlistButton } from '@/components/wishlist-button'
import { RecommendationPanel } from '@/components/recommendation-panel'
import { Badge } from '@/components/ui/badge'
import { getProductPage } from '@/services/product.service'
import type { ProductPageData } from '@/types/api.types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params
  const product = await getProductPage(id).catch(() => null)

  if (!product) notFound()

  const lowestPrice =
    product.vendors.length > 0
      ? Math.min(...product.vendors.flatMap((v) => [v.price, ...v.storePrices.map((s) => s.price)]))
      : null

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* Back link */}
        <Link
          href="/search"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to results
        </Link>

        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* Left column — image + meta */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  width={300}
                  height={200}
                  className="w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-48 items-center justify-center bg-muted">
                  <span className="text-xs text-muted-foreground">No image</span>
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
              {lowestPrice !== null && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Best price</span>
                  <span className="text-xl font-bold text-accent">
                    {lowestPrice === 0 ? 'Free' : `$${lowestPrice.toFixed(2)}`}
                  </span>
                </div>
              )}
              {product.rating !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rating</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {product.rating.toFixed(1)}
                    {product.reviewCount && (
                      <span className="text-muted-foreground font-normal">
                        ({product.reviewCount.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
              )}
              {product.metacriticScore !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Metacritic</span>
                  <Badge
                    variant="secondary"
                    className={
                      product.metacriticScore >= 75
                        ? 'bg-accent/15 text-accent'
                        : product.metacriticScore >= 50
                        ? 'bg-amber-500/15 text-amber-500'
                        : 'bg-destructive/15 text-destructive'
                    }
                  >
                    {product.metacriticScore}
                  </Badge>
                </div>
              )}
              {product.releaseDate && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Released</span>
                  <span className="text-sm text-foreground">{product.releaseDate}</span>
                </div>
              )}
            </div>

            {/* Wishlist */}
            <div className="flex justify-end">
              <WishlistButton canonicalId={product.id} />
            </div>
          </div>

          {/* Right column — main content */}
          <div className="space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{product.name}</h1>

            {/* AI Recommendation */}
            <RecommendationPanel canonicalId={product.id} />

            {/* Vendor comparison */}
            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">Compare stores</h2>
              <VendorComparisonTable vendors={product.vendors} />
            </section>

            {/* Price history */}
            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">Price history</h2>
              <PriceHistoryChart data={product.priceHistory} />
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 px-4 py-6">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Kart ·{' '}
          <Link href="/" className="hover:underline">
            Home
          </Link>
        </p>
      </footer>
    </div>
  )
}
