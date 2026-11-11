import { isUniqueConstraintError } from '@kit/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { flowPlans } from './drizzle-schema'

type Db = DrizzleD1Database<Record<string, unknown>>

export type NewPlanVersion = {
  id: string
  orgId: string
  planKey: string
  yamlSource: string
  planJson: string
  planDigest: string
  createdBy: string
  createdAt: number
  updatedAt: number
}

export type InsertPlanVersionResult =
  | { ok: true; inserted: boolean }
  | { ok: false; reason: 'conflict' }

const VERSION_UIDX = new Set(['org_id', 'plan_key', 'version'])

function columnFromUniquePart(part: string): string {
  const col = part.trim()
  const dot = col.lastIndexOf('.')
  return dot >= 0 ? col.slice(dot + 1) : col
}

function columnsFromUniqueMessage(message: string): string[] | null {
  const marker = 'UNIQUE constraint failed: '
  const at = message.indexOf(marker)
  if (at < 0) return null
  let rest = message.slice(at + marker.length)
  const cut = rest.indexOf(': SQLITE_CONSTRAINT')
  if (cut >= 0) rest = rest.slice(0, cut)
  return rest.split(',').map(columnFromUniquePart)
}

/** Columns named by a SQLite `UNIQUE constraint failed:` message, or null if absent. */
function uniqueConstraintColumns(err: unknown): string[] | null {
  let current: unknown = err
  for (let depth = 0; depth < 8 && current != null; depth++) {
    if (typeof current !== 'object') return null
    const message =
      'message' in current && typeof current.message === 'string' ? current.message : undefined
    const cause = 'cause' in current ? current.cause : undefined
    if (message) {
      const cols = columnsFromUniqueMessage(message)
      if (cols) return cols
    }
    current = cause
  }
  return null
}

/** True only for the `(org_id, plan_key, version)` unique — not id / `(id, org_id)`. */
function isPlanVersionUniqueConflict(err: unknown): boolean {
  if (!isUniqueConstraintError(err)) return false
  const cols = uniqueConstraintColumns(err)
  if (cols?.length !== 3) return false
  return cols.every((col) => VERSION_UIDX.has(col))
}

/**
 * One statement, so D1 runs it atomically: insert version MAX+1 unless this
 * org and key already store the same `yaml_source`. Under BINARY collation,
 * TEXT `=` compares bytes. Overlapping publishes of the same bytes therefore
 * leave one row; different bytes each get their own version.
 * Only the version unique index maps to `{ ok: false }`; id collisions rethrow.
 */
export async function insertPlanVersionIfNewBytes(
  db: Db,
  row: NewPlanVersion,
): Promise<InsertPlanVersionResult> {
  try {
    const result = await db.run(sql`
      INSERT INTO flow_plans (
        id, org_id, plan_key, version, enabled, yaml_source, plan_json, plan_digest,
        created_by, created_at, updated_at
      )
      SELECT
        ${row.id},
        ${row.orgId},
        ${row.planKey},
        COALESCE(
          (SELECT MAX(version) FROM flow_plans WHERE org_id = ${row.orgId} AND plan_key = ${row.planKey}),
          0
        ) + 1,
        1,
        ${row.yamlSource},
        ${row.planJson},
        ${row.planDigest},
        ${row.createdBy},
        ${row.createdAt},
        ${row.updatedAt}
      WHERE NOT EXISTS (
        SELECT 1 FROM flow_plans
        WHERE org_id = ${row.orgId} AND plan_key = ${row.planKey} AND yaml_source = ${row.yamlSource}
      )
    `)
    return { ok: true, inserted: (result.meta.changes ?? 0) > 0 }
  } catch (err) {
    if (isPlanVersionUniqueConflict(err)) return { ok: false, reason: 'conflict' }
    throw err
  }
}

/** Lowest version in this org and key whose `yaml_source` equals these bytes. NULL never matches. */
export async function getLowestPlanVersionByBytes(
  db: Db,
  orgId: string,
  planKey: string,
  yamlSource: string,
): Promise<typeof flowPlans.$inferSelect | null> {
  const rows = await db
    .select()
    .from(flowPlans)
    .where(
      and(
        eq(flowPlans.orgId, orgId),
        eq(flowPlans.planKey, planKey),
        eq(flowPlans.yamlSource, yamlSource),
      ),
    )
    .orderBy(asc(flowPlans.version))
    .limit(1)
    .all()
  return rows[0] ?? null
}
