/**
 * ADR-0005 flow plans/runs Drizzle tables.
 * Applied SQL SSoT: apps/example-api/migrations/0012_flows_plans_runs.sql.
 */
import { foreignKey, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

/** ADR-0005 / #29 — org-scoped flow plans (applied migration 0012). */
export const flowPlans = sqliteTable(
  'flow_plans',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    planKey: text('plan_key').notNull(),
    version: integer('version', { mode: 'number' }).notNull().default(1),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    yamlSource: text('yaml_source'),
    planJson: text('plan_json').notNull(),
    planDigest: text('plan_digest').notNull(),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('flow_plans_org_key_version_uidx').on(t.orgId, t.planKey, t.version),
    unique('flow_plans_id_org_uidx').on(t.id, t.orgId),
  ],
)

/** ADR-0005 / #29 — org-scoped flow runs; composite FK enforces plan org match. */
export const flowRuns = sqliteTable(
  'flow_runs',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    planId: text('plan_id').notNull(),
    planKey: text('plan_key').notNull(),
    status: text('status').notNull(),
    actorId: text('actor_id').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    planDigest: text('plan_digest').notNull(),
    workflowInstanceId: text('workflow_instance_id'),
    receiptJson: text('receipt_json'),
    errorCode: text('error_code'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.planId, t.orgId],
      foreignColumns: [flowPlans.id, flowPlans.orgId],
      name: 'flow_runs_plan_org_fk',
    }),
  ],
)

export const flowsDrizzleSchema = {
  flowPlans,
  flowRuns,
}
