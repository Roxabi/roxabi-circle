import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { baInvitation } from '../db/better-auth-schema'
import type { schema } from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export type InvitationStatus = 'pending' | 'accepted' | 'canceled'

export async function insertInvitation(
  db: Db,
  row: {
    id: string
    organizationId: string
    email: string
    role: string
    status: InvitationStatus
    expiresAt: Date
    createdAt: Date
    inviterId: string
  },
) {
  await db.insert(baInvitation).values({
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    inviterId: row.inviterId,
  })
}

export async function findInvitationById(db: Db, id: string) {
  const rows = await db.select().from(baInvitation).where(eq(baInvitation.id, id)).limit(1)
  return rows[0] ?? null
}

export async function listInvitationsForOrg(
  db: Db,
  organizationId: string,
  status?: InvitationStatus,
) {
  if (status) {
    return db
      .select()
      .from(baInvitation)
      .where(and(eq(baInvitation.organizationId, organizationId), eq(baInvitation.status, status)))
  }
  return db.select().from(baInvitation).where(eq(baInvitation.organizationId, organizationId))
}

export async function setInvitationStatus(
  db: Db,
  id: string,
  status: InvitationStatus,
): Promise<boolean> {
  const res = await db.update(baInvitation).set({ status }).where(eq(baInvitation.id, id))
  // drizzle d1 returns various shapes; treat as best-effort
  return res !== undefined
}

export async function findPendingByOrgAndEmail(db: Db, organizationId: string, email: string) {
  const rows = await db
    .select()
    .from(baInvitation)
    .where(
      and(
        eq(baInvitation.organizationId, organizationId),
        eq(baInvitation.email, email),
        eq(baInvitation.status, 'pending'),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}
