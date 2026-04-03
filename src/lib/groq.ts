import Groq from 'groq-sdk'

// Lazy initialization — avoids throwing at module load time during `next build`
// when GROQ_API_KEY is not present in the build environment.
// The recommendation service catches all Groq errors and falls back to rule-based text.
let _groq: Groq | null = null

export function getGroqClient(): Groq {
  if (!_groq) {
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}
