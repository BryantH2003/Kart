import Link from 'next/link'
import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SearchResultItem } from '@/types/api.types'

interface ProductCardProps {
  item: SearchResultItem
}

export function ProductCard({ item }: ProductCardProps) {
  const href = item.canonicalId
    ? `/product/${item.canonicalId}`
    : `/product/${item.steamAppId}`

  const formattedPrice =
    item.cheapestPrice === 0
      ? 'Free'
      : `$${item.cheapestPrice.toFixed(2)}`

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ExternalLink className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        {item.cheapestPrice === 0 && (
          <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground">
            Free
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {item.name}
        </p>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-lg font-bold text-accent">{formattedPrice}</span>
          <Button size="sm" variant="outline" asChild>
            <Link href={href}>View deals</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
