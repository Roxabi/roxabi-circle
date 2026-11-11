import { createOrgResponseSchema, meResponseSchema } from '@kit/api-client/me'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { loginCookie, seedDemoEnv } from './test/api-fixture'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

async function loginAs(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof createMemoryEnv>,
  email: string,
  password: string,
) {
  await seedDemoEnv(env, { notes: false, environment: 'test' })
  return loginCookie(app, env, email, password, ORIGIN)
}

describe('SPA parse-on-read contract against the real Worker', () => {
  it('GET /api/me 200 body satisfies meResponseSchema', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, 'staff@kit.local', 'demo-password-change-me')
    const res = await app.request('/api/me', { headers: { cookie, Origin: ORIGIN } }, env)
    expect(res.status).toBe(200)
    const parsed = meResponseSchema.parse(await res.json())
    expect(parsed.subject).toBe('user_staff')
    expect(parsed.platformRole).toBe('staff')
    expect(parsed.orgs.map((o) => o.slug).sort()).toEqual(['acme', 'beta'])
  })

  it('POST /api/orgs 201 body satisfies createOrgResponseSchema', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const cookie = await loginAs(app, env, 'solo@kit.local', 'demo-password-change-me')
    const res = await app.request(
      '/api/orgs',
      {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          Origin: ORIGIN,
        },
        body: JSON.stringify({ name: 'Contract Org', slug: 'contract-org' }),
      },
      env,
    )
    expect(res.status).toBe(201)
    const parsed = createOrgResponseSchema.parse(await res.json())
    expect(parsed.org.slug).toBe('contract-org')
    expect(parsed.org.role).toBe('owner')
    expect(parsed.org.kind).toBe('client')
    expect(parsed.org.status).toBe('active')
  })
})
