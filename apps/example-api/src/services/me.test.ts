import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { seedDemoDatabase } from '../seed/seed-db'
import { createMemoryEnv } from '../test/memory-env'
import { getMeProfile } from './me'

describe('getMeProfile (D11 api_key org filter)', () => {
  async function seededDb() {
    const env = createMemoryEnv({ ENVIRONMENT: 'test' })
    const db = createDb(env.DB as unknown as D1Database, schema)
    await seedDemoDatabase(db, { notes: false, environment: 'test' })
    return db
  }

  it('api_key without keyOrganizationId → orgs=[] (fail-closed)', async () => {
    const db = await seededDb()
    // staff has org_acme + org_beta memberships under session; unbound key must not leak them
    const profile = await getMeProfile(db, 'user_staff', {
      authMethod: 'api_key',
    })
    expect(profile.orgs).toEqual([])
    expect(profile.email).toBe('staff@kit.local')
  })

  it('api_key with null keyOrganizationId → orgs=[]', async () => {
    const db = await seededDb()
    const profile = await getMeProfile(db, 'user_staff', {
      authMethod: 'api_key',
      keyOrganizationId: null,
    })
    expect(profile.orgs).toEqual([])
  })

  it('api_key with keyOrganizationId filters to that org only', async () => {
    const db = await seededDb()
    const profile = await getMeProfile(db, 'user_staff', {
      authMethod: 'api_key',
      keyOrganizationId: 'org_acme',
    })
    expect(profile.orgs).toHaveLength(1)
    expect(profile.orgs[0]!.id).toBe('org_acme')
  })

  it('session auth returns full membership catalogue (not filtered)', async () => {
    const db = await seededDb()
    const profile = await getMeProfile(db, 'user_staff', {
      authMethod: 'session',
    })
    const ids = profile.orgs.map((o) => o.id).sort()
    expect(ids).toEqual(['org_acme', 'org_beta'])
  })
})
