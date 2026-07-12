/** Hash an API key for storage (never store plaintext). */
export async function hashApiKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Generate a demo sk_ key (plaintext shown once to client). */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sk_${body}`
}

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m?.[1]?.trim() || null
}

export async function verifyApiKey(plaintext: string, expectedHash: string): Promise<boolean> {
  const h = await hashApiKey(plaintext)
  return h === expectedHash
}
