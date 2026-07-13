import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'

export type KitDb = DrizzleD1Database<typeof schema>
