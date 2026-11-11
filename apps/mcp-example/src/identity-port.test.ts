import { describe, expect, it } from 'vitest'
import { createTicketIdentityPort } from './identity-port'

describe('ticket identity port', () => {
  it('missing session/ticket redirects to API ticket start, does not mint a token', async () => {
    const port = createTicketIdentityPort({
      redeem: async () => {
        throw new Error('redeem must not run')
      },
    })
    const request = new Request('http://127.0.0.1:8788/authorize?client_id=abc&state=s1')
    const out = await port.resolve({
      request,
      apiBaseUrl: 'http://127.0.0.1:8787',
    })
    expect(out).toBeInstanceOf(Response)
    const res = out as Response
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/api/mcp-identity/ticket')
    expect(location).toContain('resume=')
    expect(location).not.toContain('access_token')
  })

  it('redeemed ticket returns identity and not an MCP token', async () => {
    const port = createTicketIdentityPort({
      redeem: async (ticket) => {
        expect(ticket).toBe('mct_test')
        return { userId: 'user_demo', email: 'demo@kit.local' }
      },
    })
    const request = new Request(
      'http://127.0.0.1:8788/authorize?mcp_identity_ticket=mct_test&client_id=abc',
    )
    const out = await port.resolve({
      request,
      apiBaseUrl: 'http://127.0.0.1:8787',
    })
    expect(out).toEqual({ userId: 'user_demo', email: 'demo@kit.local' })
    expect(JSON.stringify(out)).not.toMatch(/access_token/)
  })

  it('failed redeem → 401, no identity', async () => {
    const port = createTicketIdentityPort({ redeem: async () => null })
    const out = await port.resolve({
      request: new Request('http://127.0.0.1:8788/authorize?mcp_identity_ticket=bad'),
      apiBaseUrl: 'http://127.0.0.1:8787',
    })
    expect(out).toBeInstanceOf(Response)
    expect((out as Response).status).toBe(401)
  })

  it('missing API_BASE_URL → 500, no token', async () => {
    const port = createTicketIdentityPort({ redeem: async () => null })
    const out = await port.resolve({
      request: new Request('http://127.0.0.1:8788/authorize'),
      apiBaseUrl: '',
    })
    expect(out).toBeInstanceOf(Response)
    expect((out as Response).status).toBe(500)
  })
})
