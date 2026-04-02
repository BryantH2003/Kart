import { describe, it, expect } from 'vitest'
import { searchQuerySchema } from '@/schemas/search.schema'

describe('searchQuerySchema', () => {
  it('accepts a valid query', () => {
    expect(searchQuerySchema.safeParse({ q: 'hades' }).success).toBe(true)
  })

  it('trims whitespace', () => {
    const result = searchQuerySchema.safeParse({ q: '  hades  ' })
    expect(result.success && result.data.q).toBe('hades')
  })

  it('rejects an empty string', () => {
    expect(searchQuerySchema.safeParse({ q: '' }).success).toBe(false)
  })

  it('rejects a query over 200 characters', () => {
    expect(searchQuerySchema.safeParse({ q: 'a'.repeat(201) }).success).toBe(false)
  })

  it('rejects a missing q param', () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false)
  })
})
