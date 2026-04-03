import { z } from 'zod'
import { BROWSE_CATEGORIES } from '@/config/browse-categories'

const validSlugs = BROWSE_CATEGORIES.map(c => c.slug) as [string, ...string[]]

export const browseQuerySchema = z.object({
  category: z.enum(validSlugs, {
    error: `category must be one of: ${validSlugs.join(', ')}`,
  }),
  sortBy: z.enum(['popular', 'rating', 'price_asc', 'new_releases']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

export type BrowseQuery = z.infer<typeof browseQuerySchema>
