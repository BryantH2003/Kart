'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface WishlistButtonProps {
  canonicalId: string
  initialTracked?: boolean
}

export function WishlistButton({ canonicalId, initialTracked = false }: WishlistButtonProps) {
  const [tracked, setTracked] = useState(initialTracked)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      if (tracked) {
        // We'd need the wishlist item ID to DELETE — skip for now, just show toast
        toast.info('Open your wishlist to remove this item.')
      } else {
        const res = await fetch('/api/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonicalId }),
        })
        if (res.status === 401) {
          toast.error('Sign in to track prices.', {
            action: { label: 'Sign in', onClick: () => { window.location.href = '/auth/login' } },
          })
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error((body as { error?: string }).error ?? 'Failed to add to wishlist.')
          return
        }
        setTracked(true)
        toast.success('Added to wishlist! Set a target price to get alerts.')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant={tracked ? 'secondary' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="gap-2"
    >
      <Heart className={`h-4 w-4 ${tracked ? 'fill-current text-primary' : ''}`} />
      {tracked ? 'Tracked' : 'Track price'}
    </Button>
  )
}
