/**
 * ADR-0007 multi-target comments Drizzle table.
 * Applied SQL SSoT: apps/example-api/migrations/* (dogfood tranche).
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** ADR-0007 — multi-target comments. */
export const kitComments = sqliteTable('kit_comments', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  visibility: text('visibility').notNull().default('shared'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const commentsDrizzleSchema = {
  kitComments,
}
