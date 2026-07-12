import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const demoNotes = sqliteTable('demo_notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  keyHash: text('key_hash').notNull().unique(),
  subject: text('subject').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'number' }),
})

export const demoUsers = sqliteTable('demo_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const schema = { demoNotes, apiKeys, demoUsers }
