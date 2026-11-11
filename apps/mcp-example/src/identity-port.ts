/**
 * Identity port: Better Auth resume via one-time API ticket.
 * Never mints MCP access tokens. Never treats BA cookies or Google ATs as Bearer.
 */
import type { McpIdentity, McpIdentityPort } from '@kit/mcp'

/** Query name the API ticket route (`apps/example-api` mcp-identity) resumes `/authorize` with. */
const IDENTITY_TICKET_QUERY = 'mcp_identity_ticket'

export type RedeemIdentityTicket = (
  ticket: string,
  apiBaseUrl: string,
) => Promise<McpIdentity | null>

function isAbsoluteHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

export function createTicketIdentityPort(opts: { redeem: RedeemIdentityTicket }): McpIdentityPort {
  return {
    async resolve(input) {
      const url = new URL(input.request.url)
      const ticket = url.searchParams.get(IDENTITY_TICKET_QUERY)?.trim()
      const apiBase = isAbsoluteHttpUrl(input.apiBaseUrl)
      if (!apiBase) {
        return new Response('MCP identity API_BASE_URL is not configured', {
          status: 500,
        })
      }

      if (ticket) {
        const identity = await opts.redeem(ticket, apiBase.origin)
        if (!identity?.userId) {
          return new Response('Invalid or expired identity ticket', { status: 401 })
        }
        return identity
      }

      const resume = new URL(url.toString())
      resume.searchParams.delete(IDENTITY_TICKET_QUERY)
      const start = new URL('/api/mcp-identity/ticket', apiBase.origin)
      start.searchParams.set('resume', resume.toString())
      return Response.redirect(start.toString(), 302)
    },
  }
}

async function redeemViaApi(ticket: string, apiBaseUrl: string): Promise<McpIdentity | null> {
  const res = await fetch(new URL('/api/mcp-identity/ticket/redeem', apiBaseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ ticket }),
  })
  if (!res.ok) return null
  const body: unknown = await res.json().catch(() => null)
  if (!body || typeof body !== 'object') return null
  const userId = 'userId' in body && typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!userId) return null
  const email = 'email' in body && typeof body.email === 'string' ? body.email.trim() : undefined
  return email ? { userId, email } : { userId }
}

/** Kit adapter: API session mints the ticket; this port only redeems or redirects. */
export function createBetterAuthTicketIdentityPort(): McpIdentityPort {
  return createTicketIdentityPort({ redeem: redeemViaApi })
}
