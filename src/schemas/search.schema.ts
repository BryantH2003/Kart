import { z } from 'zod'

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
