import { describe, expect, it } from 'vitest'
import { insertInvitation, setInvitationStatus } from './invitations'
import { createMemoryD1 } from './memory-d1'
import { insertOrganization } from './orgs'

const createdAt = new Date(0)

async function seedInvite() {
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
  await insertInvitation(db, {
    id: 'inv-1',
    organizationId: 'org-a',
    email: 'a@example.com',
    role: 'member',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt,
    inviterId: 'user-1',
  })
  return db
}

describe('invitation repo org predicate', () => {
  it('updates status only for the owning organization', async () => {
    const db = await seedInvite()
    expect(await setInvitationStatus(db, 'inv-1', 'org-b', 'canceled')).toBe(false)
    expect(await setInvitationStatus(db, 'inv-1', 'org-a', 'canceled')).toBe(true)
    expect(await setInvitationStatus(db, 'missing', 'org-a', 'accepted')).toBe(false)
  })
})
