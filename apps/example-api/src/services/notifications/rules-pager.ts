import { listRules, type RuleRow, type RuleScope } from '@kit/notifications/repos'
import type { KitDb } from '../../lib/db-type'

export async function allRules(db: KitDb, scope: RuleScope): Promise<RuleRow[]> {
  const rows: RuleRow[] = []
  let cursor: string | undefined
  do {
    const page = await listRules(db, scope, { limit: 100, cursor })
    rows.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return rows
}
