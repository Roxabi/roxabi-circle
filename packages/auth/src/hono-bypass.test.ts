import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createOrgMiddleware, type OrgContextPorts, type OrgMiddlewareEnv } from './hono'

function ports(overrides: Partial<OrgContextPorts>): OrgContextPorts {
  return {
    findOrgContext: async () => ({
      status: 'active',
      membershipRole: 'member',
      platformRole: null,
    }),
    getPlatformRole: async () => null,
    resolveModuleAccess: async () => true,
    isModuleEffective: async () => true,
    ...overrides,
  }
}

describe('organization bypass', () => {
  it('allows super_admin read bypass', async () => {
    const mw = createOrgMiddleware(
      ports({
        findOrgContext: async () => ({
          status: 'active',
          membershipRole: null,
          platformRole: 'super_admin',
        }),
      }),
    )
    const app = new Hono<OrgMiddlewareEnv>()
    app.use(async (c, next) => {
      c.set('db', {})
      c.set('subject', 'root')
      await next()
    })
    app.get('/x', mw.requireOrgContext({ allowSuperAdmin: true }), (c) =>
      c.json({ bypass: c.get('orgBypass') }),
    )
    app.onError((err, c) => c.json({ message: (err as Error).message }, 500))
    const res = await app.request('/x', { headers: { 'x-org-id': 'org-a' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ bypass: true })
  })

  it.each(['GET', 'POST'])('clears prior organization role on %s bypass', async (method) => {
    const mw = createOrgMiddleware(
      ports({
        findOrgContext: async (_db, orgId) => ({
          status: 'active',
          membershipRole: orgId === 'org-a' ? 'admin' : null,
          platformRole: 'super_admin',
        }),
      }),
    )
    const app = new Hono<OrgMiddlewareEnv>()
    app.use(async (c, next) => {
      c.set('db', {})
      c.set('subject', 'root')
      await next()
    })
    app.on(
      method,
      '/x',
      mw.requireOrgContext(),
      async (c, next) => {
        c.req.raw.headers.set('x-org-id', 'org-b')
        await next()
      },
      mw.requireOrgContext({ allowSuperAdmin: true, allowSuperAdminWrite: true }),
      (c) =>
        c.json({
          orgId: c.get('orgId'),
          bypass: c.get('orgBypass'),
          role: c.get('orgRole') ?? null,
        }),
    )
    const res = await app.request('/x', { method, headers: { 'x-org-id': 'org-a' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ orgId: 'org-b', bypass: true, role: null })
  })
})
