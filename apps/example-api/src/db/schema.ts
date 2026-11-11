import { kitAuthSchema } from '@kit/auth/schema'
import { commentsDrizzleSchema } from '@kit/comments/schema'
import { flowsDrizzleSchema } from '@kit/flows/schema'
import { notificationsDrizzleSchema } from '@kit/notifications/schema'
import { tasksDrizzleSchema } from '@kit/tasks/schema'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const demoNotes = sqliteTable('demo_notes', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const demoUsers = sqliteTable('demo_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
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

export {
  apiKeys,
  auditEvents,
  userPlatformRoles,
} from '@kit/auth/schema'
export { flowPlans, flowRunApprovals, flowRuns } from '@kit/flows/schema'

export const schema = {
  demoNotes,
  demoItems,
  demoUsers,
  ...kitAuthSchema,
  ...flowsDrizzleSchema,
  ...tasksDrizzleSchema,
  ...commentsDrizzleSchema,
  ...notificationsDrizzleSchema,
}
