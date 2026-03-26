// Auth facade — all app code imports from here.
// Only lib/auth/providers/supabase.ts touches supabase.auth directly.
// To swap auth providers: write a new provider, update the import below.

export { auth } from './providers/supabase'
export type { AuthUser, AuthProvider } from './providers/supabase'
