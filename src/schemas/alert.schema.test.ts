import { describe, it, expect } from 'vitest'
import { unsubscribeSchema } from '@/schemas/alert.schema'

describe('unsubscribeSchema', () => {
  it('accepts a valid userId and token', () => {
    expect(
      unsubscribeSchema.safeParse({
        userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        token: 'abc123',
      }).success
    ).toBe(true)
  })

  it('rejects a non-UUID userId', () => {
    expect(
      unsubscribeSchema.safeParse({ userId: 'not-a-uuid', token: 'abc123' }).success
    ).toBe(false)
  })

  it('rejects an empty token', () => {
    expect(
      unsubscribeSchema.safeParse({ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', token: '' }).success
    ).toBe(false)
  })

  it('rejects missing userId', () => {
    expect(unsubscribeSchema.safeParse({ token: 'abc123' }).success).toBe(false)
  })

  it('rejects missing token', () => {
    expect(
      unsubscribeSchema.safeParse({ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }).success
    ).toBe(false)
  })
})
