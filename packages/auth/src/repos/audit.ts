import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { auditEvents } from '../tenancy-schema'
import type { KitRepoDb } from './db-type'

export type AuditRow = {
  id: string
  createdAt: number
  actorUserId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  orgId: string | null
  ip: string | null
  metaJson: string | null
}

export async function insertAuditEvent(
  db: KitRepoDb,
  row: {
    id: string
    createdAt: number
    actorUserId?: string | null
    action: string
    targetType?: string | null
    targetId?: string | null
    orgId?: string | null
    ip?: string | null
    metaJson?: string | null
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    id: row.id,
    createdAt: row.createdAt,
    actorUserId: row.actorUserId ?? null,
    action: row.action,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    orgId: row.orgId ?? null,
    ip: row.ip ?? null,
    metaJson: row.metaJson ?? null,
  })
}

/** Insert first_login if absent (partial unique index). Returns true if inserted. */
export async function insertFirstLoginIfAbsent(
  db: KitRepoDb,
  row: {
    id: string
    createdAt: number
    actorUserId?: string | null
    targetId: string
    ip?: string | null
    metaJson?: string | null
  },
): Promise<boolean> {
  // Partial unique index is not a simple PK — use INSERT OR IGNORE.
  await db.run(
    sql`INSERT OR IGNORE INTO audit_events
      (id, created_at, actor_user_id, action, target_type, target_id, org_id, ip, meta_json)
      VALUES (
        ${row.id},
        ${row.createdAt},
        ${row.actorUserId ?? null},
        ${'first_login'},
        ${'user'},
        ${row.targetId},
        ${null},
        ${row.ip ?? null},
        ${row.metaJson ?? null}
      )`,
  )
  return true
}

export async function listAuditEvents(
  db: KitRepoDb,
  opts: { limit: number; cursorCreatedAt?: number; cursorId?: string },
): Promise<AuditRow[]> {
  const { limit, cursorCreatedAt, cursorId } = opts
  if (cursorCreatedAt != null && cursorId) {
    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        or(
          lt(auditEvents.createdAt, cursorCreatedAt),
          and(eq(auditEvents.createdAt, cursorCreatedAt), lt(auditEvents.id, cursorId)),
        ),
      )
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit)
    return rows
  }
  return db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(limit)
}

export async function countFirstLoginForUser(db: KitRepoDb, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'first_login'), eq(auditEvents.targetId, userId)))
  return Number(rows[0]?.n ?? 0)
}
