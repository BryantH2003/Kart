import { z } from 'zod'

export const recommendSchema = z.object({
  vendorProductId: z.string().uuid(),
  currentPrice: z.number().positive(),
})

export type RecommendInput = z.infer<typeof recommendSchema>
