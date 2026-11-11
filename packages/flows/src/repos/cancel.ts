import { and, eq, inArray } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { flowRuns } from '../drizzle-schema'

type Db = DrizzleD1Database<Record<string, unknown>>
/** CAS queued|running → cancelled. Returns meta.changes (1 = cancelled). */
export async function cancelRun(
  db: Db,
  input: { id: string; orgId: string; now?: number },
): Promise<number> {
  const now = input.now ?? Date.now()
  const result = await db
    .update(flowRuns)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(
        eq(flowRuns.id, input.id),
        eq(flowRuns.orgId, input.orgId),
        inArray(flowRuns.status, ['queued', 'running']),
      ),
    )
    .run()
  return result.meta.changes
}
