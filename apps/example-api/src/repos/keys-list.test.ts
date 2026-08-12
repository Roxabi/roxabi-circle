import { createDb } from '@kit/db'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema'
import { createMemoryEnv } from '../test/memory-env'
import * as keysRepo from './keys'

describe('listApiKeysForSubject D11 empty-org fail-closed', () => {
  it('returns [] for empty or whitespace organizationId (never full subject list)', async () => {
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

    const all = await keysRepo.listApiKeysForSubject(db, 'user_staff')
    expect(all.length).toBe(2)

    expect(await keysRepo.listApiKeysForSubject(db, 'user_staff', { organizationId: '' })).toEqual(
      [],
    )
    expect(
      await keysRepo.listApiKeysForSubject(db, 'user_staff', { organizationId: '   ' }),
    ).toEqual([])
    const scoped = await keysRepo.listApiKeysForSubject(db, 'user_staff', {
      organizationId: 'org_acme',
    })
    expect(scoped.map((k) => k.id)).toEqual(['key_1'])
  })
})
