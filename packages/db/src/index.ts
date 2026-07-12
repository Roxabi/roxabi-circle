import { drizzle } from 'drizzle-orm/d1'

/** Create a Drizzle client bound to a D1 database. Schemas live in apps. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDb<TSchema extends Record<string, unknown>>(d1: unknown, schema: TSchema) {
  return drizzle(d1 as never, { schema })
}
