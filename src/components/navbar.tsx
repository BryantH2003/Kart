'use client'

import Link from 'next/link'
import { ShoppingCart, Search, Heart } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="text-lg tracking-tight">Kart</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-1 sm:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/search" className="flex items-center gap-1.5">
              <Search className="h-4 w-4" />
              Search
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/wishlist" className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" />
              Wishlist
            </Link>
          </Button>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" asChild>
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
