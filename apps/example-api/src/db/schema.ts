import { foreignKey, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { betterAuthDrizzleSchema } from './better-auth-schema'

export const demoNotes = sqliteTable('demo_notes', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  keyHash: text('key_hash').notNull().unique(),
  /** Lookup index — first 12 chars of plaintext sk_ (never the full key). */
  keyPrefix: text('key_prefix').notNull().unique(),
  subject: text('subject').notNull(),
  /** ADR-0003 — multi-tenant keys are org-bound. */
  organizationId: text('organization_id'),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }),
  revokedAt: integer('revoked_at', { mode: 'number' }),
})

export const demoUsers = sqliteTable('demo_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

/** Feature modules toggled at runtime (not .env). Legacy — prefer platform_modules. */
export const kitModules = sqliteTable('kit_modules', {
  id: text('id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  /** JSON integration settings (e.g. optional module config JSON). */
  configJson: text('config_json'),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

/** ADR-0003 platform plane roles (not BA user additionalFields). */
export const userPlatformRoles = sqliteTable('user_platform_roles', {
  userId: text('user_id').primaryKey(),
  role: text('role').notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

/** ADR-0003 level-1 module catalogue. */
export const platformModules = sqliteTable('platform_modules', {
  moduleId: text('module_id').primaryKey(),
  available: integer('available', { mode: 'boolean' }).notNull().default(false),
  configJson: text('config_json'),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

/** ADR-0003 level-2 per-organization module enablement. */
export const organizationModules = sqliteTable(
  'organization_modules',
  {
    organizationId: text('organization_id').notNull(),
    moduleId: text('module_id').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    configJson: text('config_json'),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.moduleId] })],
)

/** ADR-0003 Phase B — system + custom roles per organization. */
export const organizationRoles = sqliteTable('organization_roles', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

/** ADR-0003 Phase B — per-role module grants (write | read | disabled). */
export const organizationRoleModuleGrants = sqliteTable(
  'organization_role_module_grants',
  {
    roleId: text('role_id').notNull(),
    moduleId: text('module_id').notNull(),
    access: text('access').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.moduleId] })],
)

/**
 * Durable fixed-window rate-limit counters (B-auth-harden #61).
 * Shared across Workers isolates via D1 — not an in-memory Map.
 */
export const rateLimitBuckets = sqliteTable(
  'rate_limit_buckets',
  {
    bucketKey: text('bucket_key').notNull(),
    windowStartMs: integer('window_start_ms', { mode: 'number' }).notNull(),
    count: integer('count', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucketKey, t.windowStartMs] })],
)

/** Append-only security-relevant events (super_admin list API). */
export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  orgId: text('org_id'),
  ip: text('ip'),
  metaJson: text('meta_json'),
})

export const demoItems = sqliteTable('demo_items', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  code: text('code').notNull(),
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

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

export const schema = {
  demoNotes,
  demoItems,
  flowPlans,
  flowRuns,
  apiKeys,
  demoUsers,
  kitModules,
  userPlatformRoles,
  platformModules,
  organizationModules,
  organizationRoles,
  organizationRoleModuleGrants,
  rateLimitBuckets,
  auditEvents,
  ...betterAuthDrizzleSchema,
}
