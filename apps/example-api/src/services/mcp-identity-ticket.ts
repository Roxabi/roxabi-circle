/**
 * One-time identity tickets for MCP authorize resume.
 * Hashed at rest (SHA-256). Not an MCP access token, not a BA cookie, not HMAC session.
 */
import { hashApiKey } from '@kit/auth'

const TICKET_TTL_MS = 120_000

type TicketRecord = {
  userId: string
  email?: string
  expiresAt: number
}

const tickets = new Map<string, TicketRecord>()

function randomTicketPlaintext() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `mct_${body}`
}

export async function mintIdentityTicket(identity: { userId: string; email?: string }) {
  const plaintext = randomTicketPlaintext()
  const hash = await hashApiKey(plaintext)
  tickets.set(hash, {
    userId: identity.userId,
    ...(identity.email ? { email: identity.email } : {}),
    expiresAt: Date.now() + TICKET_TTL_MS,
  })
  return plaintext
}

export async function redeemIdentityTicket(plaintext: string) {
  const hash = await hashApiKey(plaintext)
  const row = tickets.get(hash)
  tickets.delete(hash)
  if (!row) return null
  if (row.expiresAt <= Date.now()) return null
  return {
    userId: row.userId,
    ...(row.email ? { email: row.email } : {}),
  }
}

/** Test isolation only. */
export function resetIdentityTickets() {
  tickets.clear()
}

export function isAllowedMcpResumeUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null
  if (url.pathname !== '/authorize') return null
  return url
}
