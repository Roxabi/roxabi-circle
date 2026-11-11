import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Reference table identities without importing the composing Better Auth module.
const session = sqliteTable('session', { id: text('id').primaryKey() })
const user = sqliteTable('user', { id: text('id').primaryKey() })
const organization = sqliteTable('organization', { id: text('id').primaryKey() })

export const impersonationRolePermissions = sqliteTable(
  'impersonation_role_permissions',
  {
    role: text('role', { enum: ['staff', 'super_admin'] })
      .primaryKey()
      .notNull(),
    read: integer('read', { mode: 'boolean' }).notNull().default(false),
    write: integer('write', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    check('impersonation_role_permissions_role_check', sql`${t.role} in ('staff', 'super_admin')`),
  ],
)

export const impersonationSessions = sqliteTable(
  'impersonation_sessions',
  {
    id: text('id').primaryKey().notNull(),
    sessionId: text('session_id')
      .notNull()
      .unique()
      .references(() => session.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: ['read', 'write'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    check('impersonation_sessions_mode_check', sql`${t.mode} in ('read', 'write')`),
    check(
      'impersonation_sessions_distinct_users_check',
      sql`${t.actorUserId} <> ${t.subjectUserId}`,
    ),
  ],
)

export const impersonationDrizzleSchema = { impersonationRolePermissions, impersonationSessions }
