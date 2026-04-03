import Link from 'next/link'
import { Gamepad2, type LucideIcon } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { BROWSE_CATEGORIES } from '@/config/browse-categories'

// Map icon names from config to Lucide components.
// Add an entry here when a new category icon is introduced.
const ICON_MAP: Record<string, LucideIcon> = {
  Gamepad2,
}

export default function BrowsePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Browse</h1>
        <p className="mt-2 text-muted-foreground">
          Explore deals by category — no search needed.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BROWSE_CATEGORIES.map(({ slug, label, description, icon }) => {
            const Icon = ICON_MAP[icon]
            return (
              <Link
                key={slug}
                href={`/browse/${slug}`}
                className="group rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  {Icon && <Icon className="h-5 w-5 text-primary" />}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                  {label}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
                <span className="mt-4 inline-block text-sm font-medium text-primary">
                  Browse {label} →
                </span>
              </Link>
            )
          })}
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
