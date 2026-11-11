import { describe, expect, it } from 'vitest'
import { createMemoryD1 } from './memory-d1'
import { deleteGrant, deleteRole, findRoleById, insertRole, upsertGrant } from './org-roles'
import { insertOrganization } from './orgs'

const createdAt = new Date(0)

async function seedRoles() {
  const db = createMemoryD1()
  await insertOrganization(db, {
    id: 'org-a',
    name: 'Acme',
    slug: 'acme',
    kind: 'internal',
    status: 'active',
    createdAt,
  })
  await insertOrganization(db, {
    id: 'org-b',
    name: 'Beta',
    slug: 'beta',
    kind: 'client',
    status: 'active',
    createdAt,
  })
  await insertRole(db, {
    id: 'role-a',
    organizationId: 'org-a',
    key: 'custom',
    name: 'Custom',
    isSystem: false,
    createdAt: 0,
  })
  return db
}

describe('org-roles repo org predicate', () => {
  it('finds and deletes a role only in its organization', async () => {
    const db = await seedRoles()
    expect(await findRoleById(db, 'org-b', 'role-a')).toBeNull()
    expect(await findRoleById(db, 'org-a', 'role-a')).toMatchObject({ id: 'role-a' })
    expect(await deleteRole(db, 'org-b', 'role-a')).toBe(false)
    expect(await findRoleById(db, 'org-a', 'role-a')).toMatchObject({ id: 'role-a' })
    expect(await deleteRole(db, 'org-a', 'role-a')).toBe(true)
    expect(await findRoleById(db, 'org-a', 'role-a')).toBeNull()
  })

  it('upserts and deletes grants only when the role belongs to the org', async () => {
    const db = await seedRoles()
    expect(
      await upsertGrant(db, {
        organizationId: 'org-b',
        roleId: 'role-a',
        moduleId: 'demo',
        access: 'write',
      }),
    ).toBe(false)
    expect(
      await upsertGrant(db, {
        organizationId: 'org-a',
        roleId: 'role-a',
        moduleId: 'demo',
        access: 'write',
      }),
    ).toBe(true)
    expect(await deleteGrant(db, 'org-b', 'role-a', 'demo')).toBe(false)
    expect(await deleteGrant(db, 'org-a', 'role-a', 'demo')).toBe(true)
  })
})
