import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, Trash2, Bell } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { getUserWishlist } from '@/services/wishlist.service'
import type { WishlistItem } from '@/types/api.types'

async function WishlistContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  let items: WishlistItem[] = []
  try {
    items = await getUserWishlist(user.id)
  } catch {
    // show empty state
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Heart className="h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 font-medium text-foreground">Your wishlist is empty</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Search for a product and click &ldquo;Track price&rdquo; to add it.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/search">Browse products</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <WishlistRow key={item.id} item={item} />
      ))}
    </div>
  )
}

function WishlistRow({ item }: { item: WishlistItem }) {
  const hasAlert = item.targetPrice !== null
  const isBelowTarget =
    hasAlert && item.currentPrice !== null && item.currentPrice <= item.targetPrice!

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center">
      {/* Thumbnail */}
      <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No img
          </div>
        )}
      </div>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/product/${item.canonicalId}`}
          className="line-clamp-1 text-sm font-medium text-foreground hover:underline"
        >
          {item.name}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {item.currentPrice !== null && (
            <span className="text-sm font-bold text-accent">${item.currentPrice.toFixed(2)}</span>
          )}
          {hasAlert && (
            <Badge
              variant="secondary"
              className={`flex items-center gap-1 text-xs ${
                isBelowTarget ? 'bg-accent/15 text-accent' : ''
              }`}
            >
              <Bell className="h-3 w-3" />
              Alert at ${item.targetPrice!.toFixed(2)}
              {isBelowTarget && ' ✓'}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <form action={`/api/wishlist/${item.id}`} method="POST">
          <input type="hidden" name="_method" value="DELETE" />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="Remove from wishlist"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

export default function WishlistPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="mb-8 flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">My Wishlist</h1>
        </div>

        <WishlistContent />
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
