import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createOrgMiddleware, type OrgContextPorts, type OrgMiddlewareEnv } from './hono'

function ports(overrides: Partial<OrgContextPorts> = {}): OrgContextPorts {
  return {
    findOrgById: vi.fn(async () => ({ status: 'active' })),
    findMembership: vi.fn(async () => ({ role: 'member' as const })),
    getPlatformRole: vi.fn(async () => null),
    resolveModuleAccess: vi.fn(async () => true),
    isModuleEffective: vi.fn(async () => true),
    ...overrides,
  }
}

function appWith(
  mw: ReturnType<typeof createOrgMiddleware>,
  setup?: (c: { set: (k: string, v: unknown) => void }) => void,
) {
  const app = new Hono<OrgMiddlewareEnv>()
  app.use('/orgs/:orgId/*', async (c, next) => {
    c.set('db', {})
    setup?.(c)
    await next()
  })
  app.get('/orgs/:orgId/ping', mw.requireOrgContext(), (c) => c.json({ orgId: c.get('orgId') }))
  app.post('/orgs/:orgId/ping', mw.requireOrgContext({ allowSuperAdmin: true }), (c) =>
    c.json({ ok: true }),
  )
  app.get('/orgs/:orgId/admin', mw.requireOrgContext(), mw.requireOrgRole('admin'), (c) =>
    c.json({ ok: true }),
  )
  app.delete(
    '/orgs/:orgId/org',
    mw.requireOrgContext({ allowSuperAdmin: true, allowSuperAdminWrite: true }),
    mw.requireOrgCapability('delete_org'),
    (c) => c.json({ ok: true }),
  )
  app.get(
    '/staff',
    async (c, next) => {
      c.set('db', {})
      setup?.(c)
      await next()
    },
    mw.requirePlatformRole('staff'),
    (c) => c.json({ ok: true }),
  )
  app.get('/orgs/:orgId/mod', mw.requireOrgContext(), mw.requireModule('flows'), (c) =>
    c.json({ ok: true }),
  )
  app.onError((err, c) => {
    const status =
      typeof (err as { status?: number }).status === 'number'
        ? (err as { status: number }).status
        : 500
    return c.json({ message: err instanceof Error ? err.message : 'error' }, status)
  })
  return app
}

describe('createOrgMiddleware', () => {
  it('resolves org from path when member', async () => {
    const app = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
    })
    const res = await app.request('/orgs/org-a/ping')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ orgId: 'org-a' })
  })

  it('rejects missing subject', async () => {
    const app = appWith(createOrgMiddleware(ports()))
    expect((await app.request('/orgs/org-a/ping')).status).toBe(401)
  })

  it('rejects missing org id', async () => {
    const mw = createOrgMiddleware(ports())
    const app = new Hono<OrgMiddlewareEnv>()
    app.use(async (c, next) => {
      c.set('db', {})
      c.set('subject', 'user-1')
      await next()
    })
    app.get('/x', mw.requireOrgContext(), (c) => c.json({ ok: true }))
    app.onError((err, c) => {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ message: (err as Error).message }, status)
    })
    expect((await app.request('/x')).status).toBe(400)
  })

  it('rejects path/header org mismatch', async () => {
    const app = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
    })
    const res = await app.request('/orgs/org-a/ping', { headers: { 'x-org-id': 'org-b' } })
    expect(res.status).toBe(403)
  })

  it('rejects unbound API key on tenant route', async () => {
    const app = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
      c.set('authMethod', 'api_key')
    })
    expect((await app.request('/orgs/org-a/ping')).status).toBe(403)
  })

  it('rejects API key bound to another org', async () => {
    const app = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
      c.set('authMethod', 'api_key')
      c.set('keyOrganizationId', 'org-b')
    })
    expect((await app.request('/orgs/org-a/ping')).status).toBe(403)
  })

  it('allows org-bound API key', async () => {
    const app = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
      c.set('authMethod', 'api_key')
      c.set('keyOrganizationId', 'org-a')
    })
    expect((await app.request('/orgs/org-a/ping')).status).toBe(200)
  })

  it('rejects inactive org', async () => {
    const app = appWith(
      createOrgMiddleware(ports({ findOrgById: async () => ({ status: 'suspended' }) })),
      (c) => {
        c.set('subject', 'user-1')
      },
    )
    expect((await app.request('/orgs/org-a/ping')).status).toBe(403)
  })

  it('hides missing membership as 404', async () => {
    const app = appWith(createOrgMiddleware(ports({ findMembership: async () => null })), (c) => {
      c.set('subject', 'user-1')
    })
    expect((await app.request('/orgs/org-a/ping')).status).toBe(404)
  })

  it('allows super_admin read bypass', async () => {
    const mw = createOrgMiddleware(
      ports({
        findMembership: async () => null,
        getPlatformRole: async () => 'super_admin',
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

  it('blocks super_admin write without break-glass', async () => {
    const app = appWith(
      createOrgMiddleware(
        ports({
          findMembership: async () => null,
          getPlatformRole: async () => 'super_admin',
        }),
      ),
      (c) => {
        c.set('subject', 'root')
      },
    )
    expect((await app.request('/orgs/org-a/ping', { method: 'POST' })).status).toBe(403)
  })

  it('requireOrgRole respects membership', async () => {
    const member = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
    })
    expect((await member.request('/orgs/org-a/admin')).status).toBe(403)

    const admin = appWith(
      createOrgMiddleware(ports({ findMembership: async () => ({ role: 'admin' as const }) })),
      (c) => {
        c.set('subject', 'user-1')
      },
    )
    expect((await admin.request('/orgs/org-a/admin')).status).toBe(200)
  })

  it('requireOrgCapability blocks delete_org on bypass', async () => {
    const app = appWith(
      createOrgMiddleware(
        ports({
          findMembership: async () => null,
          getPlatformRole: async () => 'super_admin',
        }),
      ),
      (c) => {
        c.set('subject', 'root')
      },
    )
    expect((await app.request('/orgs/org-a/org', { method: 'DELETE' })).status).toBe(403)
  })

  it('requirePlatformRole checks staff', async () => {
    const denied = appWith(createOrgMiddleware(ports()), (c) => {
      c.set('subject', 'user-1')
    })
    expect((await denied.request('/staff')).status).toBe(403)

    const allowed = appWith(
      createOrgMiddleware(ports({ getPlatformRole: async () => 'staff' })),
      (c) => {
        c.set('subject', 'user-1')
      },
    )
    expect((await allowed.request('/staff')).status).toBe(200)
  })

  it('requireModule distinguishes missing module vs missing grant', async () => {
    const missing = appWith(
      createOrgMiddleware(
        ports({
          resolveModuleAccess: async () => false,
          isModuleEffective: async () => false,
        }),
      ),
      (c) => {
        c.set('subject', 'user-1')
      },
    )
    expect((await missing.request('/orgs/org-a/mod')).status).toBe(404)

    const forbidden = appWith(
      createOrgMiddleware(
        ports({
          resolveModuleAccess: async () => false,
          isModuleEffective: async () => true,
        }),
      ),
      (c) => {
        c.set('subject', 'user-1')
      },
    )
    expect((await forbidden.request('/orgs/org-a/mod')).status).toBe(403)
  })
})
