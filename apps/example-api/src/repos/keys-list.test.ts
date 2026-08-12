import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { createMemoryEnv } from '../test/memory-env'
import * as keysRepo from './keys'

/**
 * D11 fail-closed: when callers pass organizationId (even empty/whitespace),
 * never return the unscoped subject list.
 *
 * The empty-string org row is intentional: pure deletion of
 * `if (!org) return []` would make `eq(organizationId, '')` match key_empty
 * and this suite must go red.
 */
describe('listApiKeysForSubject D11 empty-org fail-closed', () => {
  async function seedStaffKeys() {
    const env = createMemoryEnv({
      BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32!!',
      BETTER_AUTH_URL: 'http://localhost:8787',
      ENVIRONMENT: 'test',
    })
    const db = createDb(env.DB as unknown as D1Database, schema)
    const now = Date.now()
    await keysRepo.insertApiKey(db, {
      id: 'key_1',
      keyHash: 'hash_1',
      keyPrefix: 'sk_aaaa',
      subject: 'user_staff',
      organizationId: 'org_acme',
      createdAt: now,
    })
    await keysRepo.insertApiKey(db, {
      id: 'key_2',
      keyHash: 'hash_2',
      keyPrefix: 'sk_bbbb',
      subject: 'user_staff',
      organizationId: 'org_beta',
      createdAt: now,
    })
    // Pins early-return: without fail-closed, eq(organizationId, '') matches this row.
    await keysRepo.insertApiKey(db, {
      id: 'key_empty',
      keyHash: 'hash_empty',
      keyPrefix: 'sk_cccc',
      subject: 'user_staff',
      organizationId: '',
      createdAt: now,
    })
    return db
  }

  it('unscoped list includes empty-org row (baseline fixture)', async () => {
    const db = await seedStaffKeys()
    const all = await keysRepo.listApiKeysForSubject(db, 'user_staff')
    expect(all.map((k) => k.id).sort()).toEqual(['key_1', 'key_2', 'key_empty'])
  })

  it('returns [] for empty organizationId despite empty-org row existing', async () => {
    const db = await seedStaffKeys()
    expect(await keysRepo.listApiKeysForSubject(db, 'user_staff', { organizationId: '' })).toEqual(
      [],
    )
  })

  it('returns [] for whitespace organizationId despite empty-org row existing', async () => {
    const db = await seedStaffKeys()
    expect(
      await keysRepo.listApiKeysForSubject(db, 'user_staff', { organizationId: '   ' }),
    ).toEqual([])
  })

  it('scopes to non-empty organizationId', async () => {
    const db = await seedStaffKeys()
    const scoped = await keysRepo.listApiKeysForSubject(db, 'user_staff', {
      organizationId: 'org_acme',
    })
    expect(scoped.map((k) => k.id)).toEqual(['key_1'])
  })
})
