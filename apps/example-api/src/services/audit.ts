import type { KitDb } from '../lib/db-type'
import * as auditRepo from '../repos/audit'

export const AUDIT_ACTIONS = [
  'user.created',
  'platform_role.set',
  'membership.add',
  'first_login',
  'invite.accept',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

const DENY_KEY = /token|password|secret|authorization|cookie|rawbody/i
const URL_TOKEN_QUERY = /[?&](token|code|key|secret)=/i

/** Per-action allowlisted meta keys (no free-form dump). */
const META_ALLOW: Record<string, ReadonlySet<string>> = {
  'user.created': new Set(['emailDomain']),
  'platform_role.set': new Set(['role']),
  'membership.add': new Set(['role']),
  first_login: new Set(['method']),
  'invite.accept': new Set(['invitationId']),
}

function newAuditId(): string {
  return `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

function isDeniedValue(v: unknown): boolean {
  if (typeof v !== 'string') return false
  if (URL_TOKEN_QUERY.test(v)) return true
  if (v.length > 200) return true
  return false
}

/** Sanitize meta: allowlist keys + denylist key names/values. */
export function sanitizeAuditMeta(
  action: string,
  meta?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!meta) return undefined
  const allow = META_ALLOW[action]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (DENY_KEY.test(k)) continue
    if (allow && !allow.has(k)) continue
    if (isDeniedValue(v)) continue
    if (v === undefined) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

export type AppendAuditInput = {
  action: AuditAction | string
  actorUserId?: string | null
  targetType?: string | null
  targetId?: string | null
  orgId?: string | null
  ip?: string | null
  meta?: Record<string, unknown> | null
  /** When set, included in failure logs (best-effort audit). */
  requestId?: string | null
}

/** Emit user.created + optional platform_role.set + membership.add (admin provision). */
export async function emitAdminUserProvisioned(
  db: KitDb,
  input: {
    actorUserId: string
    userId: string
    email: string
    platformRole?: string | null
    memberships: { organizationId: string; role: string }[]
  },
): Promise<void> {
  const emailDomain = input.email.includes('@') ? input.email.split('@')[1] : undefined
  await appendAudit(db, {
    action: 'user.created',
    actorUserId: input.actorUserId,
    targetType: 'user',
    targetId: input.userId,
    meta: emailDomain ? { emailDomain } : undefined,
  })
  if (input.platformRole) {
    await appendAudit(db, {
      action: 'platform_role.set',
      actorUserId: input.actorUserId,
      targetType: 'user',
      targetId: input.userId,
      meta: { role: input.platformRole },
    })
  }
  for (const m of input.memberships) {
    await appendAudit(db, {
      action: 'membership.add',
      actorUserId: input.actorUserId,
      targetType: 'user',
      targetId: input.userId,
      orgId: m.organizationId,
      meta: { role: m.role },
    })
  }
}

/**
 * Best-effort audit append. Domain callers must not roll back on failure.
 * Failures log `action` + `requestId` (when provided) and return false.
 */
export async function appendAudit(db: KitDb, input: AppendAuditInput): Promise<boolean> {
  const cleanMeta = sanitizeAuditMeta(input.action, input.meta)
  try {
    await auditRepo.insertAuditEvent(db, {
      id: newAuditId(),
      createdAt: Date.now(),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      orgId: input.orgId,
      ip: input.ip,
      metaJson: cleanMeta ? JSON.stringify(cleanMeta) : null,
    })
    return true
  } catch (err) {
    const rid = input.requestId ?? 'unknown'
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'audit_append_failed',
        action: input.action,
        requestId: rid,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return false
  }
}

/** Idempotent first_login via unique index; best-effort. */
export async function tryFirstLogin(
  db: KitDb,
  opts: {
    userId: string
    actorUserId?: string | null
    ip?: string | null
    method?: string
    requestId?: string | null
  },
): Promise<void> {
  const meta = sanitizeAuditMeta('first_login', opts.method ? { method: opts.method } : null)
  try {
    await auditRepo.insertFirstLoginIfAbsent(db, {
      id: newAuditId(),
      createdAt: Date.now(),
      actorUserId: opts.actorUserId ?? opts.userId,
      targetId: opts.userId,
      ip: opts.ip,
      metaJson: meta ? JSON.stringify(meta) : null,
    })
  } catch (err) {
    const rid = opts.requestId ?? 'unknown'
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'audit_append_failed',
        action: 'first_login',
        requestId: rid,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

export type ListedAuditEvent = {
  id: string
  createdAt: number
  actorUserId: string | null
  action: string
  targetType?: string
  targetId?: string
  orgId?: string | null
  ip?: string | null
  meta?: Record<string, unknown>
}

export async function listRecentAuditEvents(
  db: KitDb,
  opts: { limit?: number; cursor?: string | null },
): Promise<{ items: ListedAuditEvent[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
  let cursorCreatedAt: number | undefined
  let cursorId: string | undefined
  if (opts.cursor) {
    const parts = opts.cursor.split(':')
    if (parts.length !== 2) {
      const { AppError } = await import('@gosilex/core')
      throw AppError.validation('Invalid cursor')
    }
    const ts = Number(parts[0])
    const id = parts[1]
    if (!Number.isFinite(ts) || !id) {
      const { AppError } = await import('@gosilex/core')
      throw AppError.validation('Invalid cursor')
    }
    cursorCreatedAt = ts
    cursorId = id
  }

  const rows = await auditRepo.listAuditEvents(db, {
    limit: limit + 1,
    cursorCreatedAt,
    cursorId,
  })
  const page = rows.slice(0, limit)
  const items: ListedAuditEvent[] = page.map((r) => {
    let meta: Record<string, unknown> | undefined
    if (r.metaJson) {
      try {
        meta = JSON.parse(r.metaJson) as Record<string, unknown>
      } catch {
        meta = undefined
      }
    }
    return {
      id: r.id,
      createdAt: r.createdAt,
      actorUserId: r.actorUserId,
      action: r.action,
      ...(r.targetType ? { targetType: r.targetType } : {}),
      ...(r.targetId ? { targetId: r.targetId } : {}),
      ...(r.orgId != null ? { orgId: r.orgId } : {}),
      ...(r.ip != null ? { ip: r.ip } : {}),
      ...(meta ? { meta } : {}),
    }
  })
  const next =
    rows.length > limit && page.length > 0
      ? `${page[page.length - 1]!.createdAt}:${page[page.length - 1]!.id}`
      : null
  return { items, nextCursor: next }
}
