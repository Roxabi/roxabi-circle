import { and, eq } from 'drizzle-orm'
import { impersonationRolePermissions, impersonationSessions } from '../impersonation-schema'
import { auditEvents } from '../tenancy-schema'
import type { KitRepoDb } from './db-type'

export type ImpersonationRole = 'staff' | 'super_admin'
export type ImpersonationPermission = { role: ImpersonationRole; read: boolean; write: boolean }
export type ImpersonationSession = {
  id: string
  sessionId: string
  actorUserId: string
  subjectUserId: string
  organizationId: string
  mode: 'read' | 'write'
  createdAt: number
}
export type ImpersonationAuditContext = { actorUserId: string; requestId?: string; ip?: string }
export type ImpersonationRequestContext = {
  requestId: string
  method: string
  path: string
  ip?: string
}

function event(
  action: string,
  context: ImpersonationAuditContext,
  metadata: object,
  targetType: string,
  targetId: string,
  orgId: string | null,
) {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    actorUserId: context.actorUserId,
    action,
    targetType,
    targetId,
    orgId,
    ip: context.ip ?? null,
    metaJson: JSON.stringify({
      ...metadata,
      ...(context.requestId ? { requestId: context.requestId } : {}),
    }),
  }
}

function delegationMetadata(row: ImpersonationSession) {
  return {
    delegationId: row.id,
    sessionId: row.sessionId,
    actorUserId: row.actorUserId,
    subjectUserId: row.subjectUserId,
    organizationId: row.organizationId,
    mode: row.mode,
  }
}

export async function getImpersonationPermissions(
  db: KitRepoDb,
  role: ImpersonationRole,
): Promise<{ read: boolean; write: boolean }> {
  const row = await db
    .select()
    .from(impersonationRolePermissions)
    .where(eq(impersonationRolePermissions.role, role))
    .get()
  return { read: row?.read ?? false, write: row?.write ?? false }
}

export async function listImpersonationPermissions(
  db: KitRepoDb,
): Promise<ImpersonationPermission[]> {
  const rows = await db.select().from(impersonationRolePermissions).all()
  return (['staff', 'super_admin'] as const).map((role) => {
    const row = rows.find((item) => item.role === role)
    return { role, read: row?.read ?? false, write: row?.write ?? false }
  })
}

export async function setImpersonationPermissions(
  db: KitRepoDb,
  permission: ImpersonationPermission,
  context: ImpersonationAuditContext,
): Promise<void> {
  await db.batch([
    db
      .insert(impersonationRolePermissions)
      .values(permission)
      .onConflictDoUpdate({
        target: impersonationRolePermissions.role,
        set: { read: permission.read, write: permission.write },
      }),
    db
      .insert(auditEvents)
      .values(
        event(
          'impersonation.permissions.updated',
          context,
          permission,
          'platform_role',
          permission.role,
          null,
        ),
      ),
  ])
}

export async function findImpersonationSession(
  db: KitRepoDb,
  sessionId: string,
): Promise<ImpersonationSession | null> {
  return (
    (await db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.sessionId, sessionId))
      .get()) ?? null
  )
}

export async function startImpersonationSession(
  db: KitRepoDb,
  row: ImpersonationSession,
  context: ImpersonationAuditContext,
): Promise<void> {
  await db.batch([
    db.insert(impersonationSessions).values(row),
    db
      .insert(auditEvents)
      .values(
        event(
          'impersonation.started',
          context,
          delegationMetadata(row),
          'user',
          row.subjectUserId,
          row.organizationId,
        ),
      ),
  ])
}

export async function stopImpersonationSession(
  db: KitRepoDb,
  key: { sessionId: string; expectedId: string },
  context: ImpersonationAuditContext,
): Promise<boolean> {
  const rows = await db
    .delete(impersonationSessions)
    .where(
      and(
        eq(impersonationSessions.sessionId, key.sessionId),
        eq(impersonationSessions.id, key.expectedId),
      ),
    )
    .returning()
    .all()
  const row = rows[0]
  if (!row) return false
  try {
    await db
      .insert(auditEvents)
      .values(
        event(
          'impersonation.stopped',
          context,
          delegationMetadata(row),
          'user',
          row.subjectUserId,
          row.organizationId,
        ),
      )
  } catch {
    // Terminating delegation must not depend on audit availability.
  }
  return true
}

export async function recordImpersonationRequest(
  db: KitRepoDb,
  row: ImpersonationSession,
  context: ImpersonationRequestContext,
): Promise<void> {
  const path = context.path.split(/[?#]/, 1)[0] ?? ''
  await db.insert(auditEvents).values(
    event(
      'impersonation.request.attempt',
      {
        actorUserId: row.actorUserId,
        requestId: context.requestId,
        ip: context.ip,
      },
      { ...delegationMetadata(row), method: context.method, path },
      'impersonation_session',
      row.id,
      row.organizationId,
    ),
  )
}
