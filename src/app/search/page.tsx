import { Suspense } from 'react'
import Link from 'next/link'
import { Search, AlertCircle } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { ProductCard } from '@/components/product-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SearchResultItem } from '@/types/api.types'

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

async function SearchResults({ query }: { query: string }) {
  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search className="h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">Enter a search term to find products.</p>
      </div>
    )
  }

  let results: SearchResultItem[] = []
  let errorMsg: string | null = null

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const res = await fetch(
      `${baseUrl}/api/search?q=${encodeURIComponent(query)}`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      errorMsg = (body as { error?: string }).error ?? 'Search failed. Please try again.'
    } else {
      const body = await res.json()
      results = Array.isArray(body) ? (body as SearchResultItem[]) : ((body as { results: SearchResultItem[] }).results ?? [])
    }
  } catch {
    errorMsg = 'Unable to reach the server. Please try again.'
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm text-muted-foreground">{errorMsg}</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search className="h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 font-medium text-foreground">No results for &ldquo;{query}&rdquo;</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a shorter or different search term.</p>
      </div>
    )
  }

  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">
        {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((item) => (
          <ProductCard key={item.gameId} item={item} />
        ))}
      </div>
    </>
  )
}

function SearchResultsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="aspect-video w-full animate-pulse bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = '' } = await searchParams

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {/* Inline search bar */}
        <form method="GET" action="/search" className="mb-8 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search products…"
              className="h-10 pl-10 text-sm"
            />
          </div>
          <Button type="submit" size="default" className="h-10 px-5 text-sm font-semibold">
            Search
          </Button>
        </form>

        <Suspense fallback={<SearchResultsSkeleton />}>
          <SearchResults query={q} />
        </Suspense>
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
