import { describe, it, expect } from 'vitest'
import { addWishlistSchema, updateWishlistSchema } from '@/schemas/wishlist.schema'

describe('addWishlistSchema', () => {
  it('accepts valid canonicalId with no targetPrice', () => {
    expect(addWishlistSchema.safeParse({ canonicalId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }).success).toBe(true)
  })

  it('accepts valid canonicalId with positive targetPrice', () => {
    expect(addWishlistSchema.safeParse({ canonicalId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', targetPrice: 9.99 }).success).toBe(true)
  })

  it('rejects missing canonicalId', () => {
    expect(addWishlistSchema.safeParse({ targetPrice: 9.99 }).success).toBe(false)
  })

  it('rejects non-UUID canonicalId', () => {
    expect(addWishlistSchema.safeParse({ canonicalId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects negative targetPrice', () => {
    expect(addWishlistSchema.safeParse({ canonicalId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', targetPrice: -1 }).success).toBe(false)
  })

  it('rejects zero targetPrice', () => {
    expect(addWishlistSchema.safeParse({ canonicalId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', targetPrice: 0 }).success).toBe(false)
  })
})

describe('updateWishlistSchema', () => {
  it('accepts a positive targetPrice', () => {
    expect(updateWishlistSchema.safeParse({ targetPrice: 14.99 }).success).toBe(true)
  })

  it('accepts null targetPrice (clears the alert)', () => {
    expect(updateWishlistSchema.safeParse({ targetPrice: null }).success).toBe(true)
  })

  it('rejects negative targetPrice', () => {
    expect(updateWishlistSchema.safeParse({ targetPrice: -5 }).success).toBe(false)
  })

  it('rejects missing targetPrice field', () => {
    expect(updateWishlistSchema.safeParse({}).success).toBe(false)
  })
})
