import { describe, it, expect } from 'vitest'
import { browseQuerySchema } from './browse.schema'

describe('browseQuerySchema', () => {
  describe('category', () => {
    it('accepts a valid category slug', () => {
      const result = browseQuerySchema.safeParse({ category: 'games' })
      expect(result.success).toBe(true)
    })

    it('rejects an unknown category slug', () => {
      const result = browseQuerySchema.safeParse({ category: 'electronics' })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toMatch(/must be one of/)
    })

    it('rejects a missing category', () => {
      const result = browseQuerySchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('sortBy', () => {
    it.each(['popular', 'rating', 'price_asc', 'new_releases'] as const)(
      'accepts valid sortBy value "%s"',
      (sortBy) => {
        const result = browseQuerySchema.safeParse({ category: 'games', sortBy })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.sortBy).toBe(sortBy)
      }
    )

    it('rejects an unknown sortBy value', () => {
      const result = browseQuerySchema.safeParse({ category: 'games', sortBy: 'newest' })
      expect(result.success).toBe(false)
    })

    it('is optional — omitting sortBy succeeds', () => {
      const result = browseQuerySchema.safeParse({ category: 'games' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.sortBy).toBeUndefined()
    })
  })

  describe('page', () => {
    it('coerces a string "2" to the number 2', () => {
      const result = browseQuerySchema.safeParse({ category: 'games', page: '2' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.page).toBe(2)
    })

    it('accepts page as a number directly', () => {
      const result = browseQuerySchema.safeParse({ category: 'games', page: 5 })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.page).toBe(5)
    })

    it('rejects page less than 1', () => {
      const result = browseQuerySchema.safeParse({ category: 'games', page: 0 })
      expect(result.success).toBe(false)
    })

    it('rejects a non-integer page', () => {
      const result = browseQuerySchema.safeParse({ category: 'games', page: 1.5 })
      expect(result.success).toBe(false)
    })

    it('is optional — omitting page succeeds', () => {
      const result = browseQuerySchema.safeParse({ category: 'games' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.page).toBeUndefined()
    })
  })
})
