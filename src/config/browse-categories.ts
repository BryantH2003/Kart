import type { ProductCategory } from '@/vendors/types'

export interface BrowseCategory {
  slug: string
  label: string
  description: string
  productCategory: ProductCategory
  // Lucide icon name — looked up at render time to keep this file server/client-safe.
  icon: string
}

export const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    slug: 'games',
    label: 'Games',
    description: 'PC games from Steam and 50+ storefronts — compare prices across every store.',
    productCategory: 'game',
    icon: 'Gamepad2',
  },
]
