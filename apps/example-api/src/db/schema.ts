import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

/** Feature modules toggled at runtime (not .env). */
export const kitModules = sqliteTable('kit_modules', {
  id: text('id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  /** JSON integration settings (e.g. Spark URL + API key for feedback). */
  configJson: text('config_json'),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const schema = { demoNotes, apiKeys, demoUsers, kitModules }
