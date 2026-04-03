import { Resend } from 'resend'

// Lazy initialization — avoids throwing at module load time during `next build`
// when RESEND_API_KEY is not present in the build environment.
let _resend: Resend | null = null

export function getResendClient(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}
