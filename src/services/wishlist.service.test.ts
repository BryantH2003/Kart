import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/repositories/wishlist.repository', () => ({
  findByUser: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  updateTarget: vi.fn(),
}))

vi.mock('@/repositories/price.repository', () => ({
  getLatest: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  }),
}))

import * as wishlistRepo from '@/repositories/wishlist.repository'
import { addItem, removeItem } from '@/services/wishlist.service'
import type { WishlistItem } from '@/types/api.types'

const existingItem: WishlistItem = {
  id: 'wl-1',
  canonicalId: 'canonical-abc',
  name: 'Hades',
  imageUrl: null,
  currentPrice: 14.99,
  targetPrice: 10.0,
  createdAt: new Date().toISOString(),
}

beforeEach(() => vi.clearAllMocks())

describe('addItem()', () => {
  it('throws when item is already on wishlist', async () => {
    vi.mocked(wishlistRepo.findByUser).mockResolvedValue([existingItem])

    await expect(addItem('user-1', 'canonical-abc', null)).rejects.toThrow(
      'Item already on wishlist'
    )
    expect(wishlistRepo.insert).not.toHaveBeenCalled()
  })

  it('inserts when item is not yet on wishlist', async () => {
    vi.mocked(wishlistRepo.findByUser).mockResolvedValue([])
    vi.mocked(wishlistRepo.insert).mockResolvedValue('new-wl-id')

    const id = await addItem('user-1', 'canonical-new', 9.99)

    expect(wishlistRepo.insert).toHaveBeenCalledWith('user-1', 'canonical-new', 9.99)
    expect(id).toBe('new-wl-id')
  })
})

describe('removeItem()', () => {
  it('delegates to repository with userId for IDOR protection', async () => {
    vi.mocked(wishlistRepo.remove).mockResolvedValue(undefined)

    await removeItem('user-1', 'wl-1')

    expect(wishlistRepo.remove).toHaveBeenCalledWith('user-1', 'wl-1')
  })
})
