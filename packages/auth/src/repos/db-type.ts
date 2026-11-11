import type { DrizzleD1Database } from 'drizzle-orm/d1'

/** Generic D1 handle for kit package repos (no app schema coupling). */
export type KitRepoDb = DrizzleD1Database<Record<string, unknown>>
