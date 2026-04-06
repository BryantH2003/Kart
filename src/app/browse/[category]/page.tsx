import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { ProductCard } from '@/components/product-card'
import { BROWSE_CATEGORIES } from '@/config/browse-categories'
import { browse } from '@/services/browse.service'
import type { BrowseSortBy } from '@/services/browse.service'
import type { SearchResultItem } from '@/types/api.types'

interface PageProps {
  params: Promise<{ category: string }>
  searchParams: Promise<{ sortBy?: string }>
}

const SORT_OPTIONS = [
  { value: 'popular',      label: 'Popular' },
  { value: 'rating',       label: 'Best Rated' },
  { value: 'price_asc',    label: 'Lowest Price' },
  { value: 'new_releases', label: 'New Releases' },
] as const

type SortValue = BrowseSortBy

function isValidSort(v: string | undefined): v is SortValue {
  return SORT_OPTIONS.some(o => o.value === v)
}

async function BrowseResults({
  categorySlug,
  sortBy,
}: {
  categorySlug: string
  sortBy: SortValue
}) {
  let results: SearchResultItem[] = []
  let errorMsg: string | null = null

  try {
    results = await browse(categorySlug, sortBy)
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load results.'
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm text-muted-foreground">{errorMsg}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {results.map(item => (
        <ProductCard key={item.gameId} item={item} />
      ))}
    </div>
  )
}

function BrowseResultsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
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

export default async function BrowseCategoryPage({ params, searchParams }: PageProps) {
  const { category: categorySlug } = await params
  const { sortBy: rawSort } = await searchParams

  const categoryDef = BROWSE_CATEGORIES.find(c => c.slug === categorySlug)
  if (!categoryDef) notFound()

  const sortBy: SortValue = isValidSort(rawSort) ? rawSort : 'popular'

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/browse" className="hover:text-foreground hover:underline">
            Browse
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{categoryDef.label}</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {categoryDef.label}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{categoryDef.description}</p>

        {/* Sort tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {SORT_OPTIONS.map(option => (
            <Link
              key={option.value}
              href={`/browse/${categorySlug}?sortBy=${option.value}`}
              className={[
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                sortBy === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30',
              ].join(' ')}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {/* Product grid */}
        <div className="mt-8">
          <Suspense fallback={<BrowseResultsSkeleton />}>
            <BrowseResults categorySlug={categorySlug} sortBy={sortBy} />
          </Suspense>
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
