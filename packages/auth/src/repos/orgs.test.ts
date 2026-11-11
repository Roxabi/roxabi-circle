import { describe, expect, it } from 'vitest'
import { createMemoryD1 } from './memory-d1'
import {
  filterMemberUserIds,
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

const createdAt = new Date(0)

async function seedAcme(db: ReturnType<typeof createMemoryD1>) {
  await insertOrganization(db, {
    id: 'org-a',
    name: 'Acme',
    slug: 'acme',
    kind: 'internal',
    status: 'active',
    createdAt,
  })
}

describe('auth orgs repo', () => {
  it('looks up org and membership by ids', async () => {
    const db = createMemoryD1()
    await seedAcme(db)
    const org = await findOrgById(db, 'org-a')
    expect(org).toMatchObject({
      id: 'org-a',
      name: 'Acme',
      slug: 'acme',
      kind: 'internal',
      status: 'active',
    })
    expect(await findOrgById(db, 'org-b')).toBeNull()
    expect(await findMembership(db, 'org-a', 'user-1')).toBeNull()
    expect(await listMembers(db, 'org-a')).toEqual([])
    expect(await listMembershipsForUser(db, 'user-1')).toEqual([])
    expect(await listMembersInOrgs(db, [])).toEqual([])
  })

  it('inserts org/member and lists remaining queries', async () => {
    const db = createMemoryD1()
    expect(await findOrgBySlug(db, 'acme')).toBeNull()
    expect(await listAllOrgs(db)).toEqual([])
    expect(await listMembersInOrgs(db, ['org-a'])).toEqual([])
    await seedAcme(db)
    expect(await findOrgBySlug(db, 'acme')).toMatchObject({ id: 'org-a', slug: 'acme' })
    expect(await findOrgBySlug(db, 'other')).toBeNull()
    expect(await listAllOrgs(db)).toEqual([expect.objectContaining({ id: 'org-a', slug: 'acme' })])

    await insertMember(db, {
      id: 'm1',
      organizationId: 'org-a',
      userId: 'user-1',
      role: 'admin',
      createdAt,
    })
    expect(await findMembership(db, 'org-a', 'user-1')).toMatchObject({
      id: 'm1',
      organizationId: 'org-a',
      userId: 'user-1',
      role: 'admin',
    })
    expect(await findMembership(db, 'org-b', 'user-1')).toBeNull()
    expect(await listMembers(db, 'org-a')).toEqual([
      expect.objectContaining({ id: 'm1', organizationId: 'org-a', userId: 'user-1' }),
    ])
    expect(await listMembers(db, 'org-b')).toEqual([])
    expect(await listMembershipsForUser(db, 'user-1')).toEqual([
      expect.objectContaining({
        memberId: 'm1',
        role: 'admin',
        organizationId: 'org-a',
        orgName: 'Acme',
        orgSlug: 'acme',
        orgKind: 'internal',
        orgStatus: 'active',
      }),
    ])
    expect(await listMembersInOrgs(db, ['org-a'])).toEqual([
      expect.objectContaining({ id: 'm1', organizationId: 'org-a' }),
    ])
    expect(await listMembersInOrgs(db, ['org-b'])).toEqual([])
  })

  it('filterMemberUserIds keeps only members of that org, across D1 bind chunks', async () => {
    const db = createMemoryD1()
    await seedAcme(db)
    await insertOrganization(db, {
      id: 'org-b',
      name: 'Beta',
      slug: 'beta',
      kind: 'internal',
      status: 'active',
      createdAt,
    })
    const member = (id: string, organizationId: string, userId: string) =>
      insertMember(db, { id, organizationId, userId, role: 'member', createdAt })
    await member('m-a1', 'org-a', 'user-1')
    await member('m-b1', 'org-b', 'user-2')
    // 90 members of org-a force a second chunk (chunk size 80).
    const crowd = Array.from({ length: 90 }, (_, i) => `crowd-${i}`)
    for (const [i, userId] of crowd.entries()) await member(`m-c${i}`, 'org-a', userId)

    expect(await filterMemberUserIds(db, 'org-a', [])).toEqual([])
    expect(await filterMemberUserIds(db, 'org-a', ['user-1', 'user-2', 'nobody'])).toEqual([
      'user-1',
    ])
    expect(await filterMemberUserIds(db, 'org-b', ['user-1', 'user-2'])).toEqual(['user-2'])
    expect(await filterMemberUserIds(db, 'org-a', [...crowd, 'user-2'])).toHaveLength(90)
  })
})
