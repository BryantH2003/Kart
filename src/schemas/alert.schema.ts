import { z } from 'zod'

export const setAlertSchema = z.object({
  canonicalId: z.string().uuid(),
  targetPrice: z.number().positive(),
})

export const unsubscribeSchema = z.object({
  userId: z.string().uuid(),
  token: z.string().min(1),
})

export type SetAlertInput = z.infer<typeof setAlertSchema>
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>
