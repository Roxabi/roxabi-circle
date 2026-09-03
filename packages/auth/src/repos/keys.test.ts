import { describe, expect, it } from 'vitest'
import { findApiKeyByPrefix, insertApiKey } from './keys'
import {
  getKitModule,
  insertKitModule,
  listKitModules,
  setKitModuleConfig,
  setKitModuleEnabled,
} from './modules'
import { getPlatformRole, getPlatformRolesForUsers, setPlatformRole } from './platform-roles'

function chain() {
  const self: Record<string, unknown> = {
    from() {
      return self
    },
    where() {
      return self
    },
    limit() {
      return self
    },
    set() {
      return self
    },
    values() {
      return self
    },
    onConflictDoUpdate() {
      return self
    },
    all: async () => [],
    get: async () => undefined,
    run: async () => ({ success: true }),
    // biome-ignore lint/suspicious/noThenProperty: fake drizzle query
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve([]).then(resolve)
    },
  }
  return self
}

function fakeDb() {
  return {
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    delete: () => chain(),
  } as never
}

describe('auth keys/modules/roles repos', () => {
  it('executes key and module lookups', async () => {
    const db = fakeDb()
    await insertApiKey(db, {
      id: 'k1',
      keyHash: 'h',
      keyPrefix: 'sk_test',
      subject: 'user-1',
      organizationId: 'org-a',
      createdAt: 1,
    })
    expect(await findApiKeyByPrefix(db, 'sk_test')).toBeNull()
    expect(await listKitModules(db)).toEqual([])
    await getKitModule(db, 'flows')
    await insertKitModule(db, 'flows', true, null, 1)
    await setKitModuleEnabled(db, 'flows', false, 2)
    await setKitModuleConfig(db, 'flows', '{}', 3)
  })

  it('reads and writes platform roles', async () => {
    const db = fakeDb()
    expect(await getPlatformRole(db, 'user-1')).toBeNull()
    expect(await getPlatformRolesForUsers(db, [])).toEqual(new Map())
    expect(await getPlatformRolesForUsers(db, ['user-1'])).toEqual(new Map())
    await setPlatformRole(db, 'user-1', 'staff')
  })
})
