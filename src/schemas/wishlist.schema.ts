import { z } from 'zod'

export const addWishlistSchema = z.object({
  canonicalId: z.string().uuid(),
  targetPrice: z.number().positive().optional(),
})

export const updateWishlistSchema = z.object({
  targetPrice: z.number().positive().nullable(),
})

export type AddWishlistInput = z.infer<typeof addWishlistSchema>
export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>
