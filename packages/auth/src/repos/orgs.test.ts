import { describe, expect, it } from 'vitest'
import {
  findMembership,
  findOrgById,
  findOrgBySlug,
  insertMember,
  insertOrganization,
  listAllOrgs,
  listMembers,
  listMembershipsForUser,
  listMembersInOrgs,
} from './orgs'

function chain() {
  const self: Record<string, unknown> = {
    from() {
      return self
    },
    where() {
      return self
    },
    innerJoin() {
      return self
    },
    orderBy() {
      return self
    },
    limit() {
      return self
    },
    values() {
      return self
    },
    // drizzle queries are thenable
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

describe('auth orgs repo', () => {
  it('looks up org and membership by ids', async () => {
    const db = fakeDb()
    expect(await findOrgById(db, 'org-a')).toBeNull()
    expect(await findMembership(db, 'org-a', 'user-1')).toBeNull()
    expect(await listMembers(db, 'org-a')).toEqual([])
    expect(await listMembershipsForUser(db, 'user-1')).toEqual([])
    expect(await listMembersInOrgs(db, [])).toEqual([])
  })

  it('inserts org/member and lists remaining queries', async () => {
    const db = fakeDb()
    expect(await findOrgBySlug(db, 'acme')).toBeNull()
    expect(await listAllOrgs(db)).toEqual([])
    expect(await listMembersInOrgs(db, ['org-a'])).toEqual([])
    await insertOrganization(db, {
      id: 'org-a',
      name: 'Acme',
      slug: 'acme',
      kind: 'internal',
      status: 'active',
      createdAt: new Date(0),
    })
    await insertMember(db, {
      id: 'm1',
      organizationId: 'org-a',
      userId: 'user-1',
      role: 'admin',
      createdAt: new Date(0),
    })
  })
})
