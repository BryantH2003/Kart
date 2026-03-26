// Only file in the codebase that calls supabase.auth directly.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface AuthUser {
  id: string
  email: string | undefined
}

export interface AuthProvider {
  getUser(): Promise<AuthUser | null>
  requireUser(): Promise<AuthUser>
}

export const auth: AuthProvider = {
  async getUser(): Promise<AuthUser | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return { id: user.id, email: user.email }
  },

  async requireUser(): Promise<AuthUser> {
    const user = await auth.getUser()
    if (!user) redirect('/auth/login')
    return user
  },
}
