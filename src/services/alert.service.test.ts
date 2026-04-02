import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/resend', () => ({ resend: { emails: { send: vi.fn() } } }))

import { generateUnsubToken, verifyUnsubToken } from '@/services/alert.service'

// Set a stable secret for tests
vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-32-chars-long-xxxxxxxx')

describe('generateUnsubToken() / verifyUnsubToken()', () => {
  it('generates a hex HMAC token', () => {
    const token = generateUnsubToken('user-123')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same userId always produces the same token', () => {
    expect(generateUnsubToken('user-123')).toBe(generateUnsubToken('user-123'))
  })

  it('different userIds produce different tokens', () => {
    expect(generateUnsubToken('user-a')).not.toBe(generateUnsubToken('user-b'))
  })

  it('verifies a valid token', () => {
    const token = generateUnsubToken('user-123')
    expect(verifyUnsubToken('user-123', token)).toBe(true)
  })

  it('rejects a tampered token', () => {
    const token = generateUnsubToken('user-123')
    const tampered = token.slice(0, -2) + '00'
    expect(verifyUnsubToken('user-123', tampered)).toBe(false)
  })

  it('rejects a token for a different userId', () => {
    const token = generateUnsubToken('user-a')
    expect(verifyUnsubToken('user-b', token)).toBe(false)
  })
})
