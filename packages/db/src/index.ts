import { drizzle } from 'drizzle-orm/d1'
import { callSqlite, isUniqueConstraintError, toWorkerdD1Error } from './sqlite-error'

/** D1-shaped binding (Workers D1 or a test double). */
export type KitD1Statement = {
  bind(...values: unknown[]): KitD1Statement
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
  all(): Promise<unknown>
  raw<T = unknown>(): Promise<T[][]>
}

export type KitD1Database = {
  prepare(query: string): KitD1Statement
  batch?(statements: unknown[]): Promise<unknown>
  exec?(query: string): Promise<unknown>
}

/** Create a Drizzle client bound to a D1 database. Table schemas live in kit package schema subpaths; apps compose. */
export function createDb<TSchema extends Record<string, unknown>>(
  d1: KitD1Database,
  schema: TSchema,
) {
  // drizzle-orm/d1 names the workers `D1Database` type; the public contract is the duck above.
  return drizzle(d1 as never, { schema })
}

/** D1 max bound params ≈ 100; leave headroom for sibling predicates. */
export const D1_IN_ARRAY_CHUNK = 80

/** Map over `ids` in chunks of `chunkSize` (e.g. D1 `IN (...)` bind limits). */
export async function mapInChunks<T, R>(
  ids: readonly T[],
  chunkSize: number,
  fn: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize) as T[]
    out.push(...(await fn(chunk)))
  }
  return out
}

export { callSqlite, isUniqueConstraintError, toWorkerdD1Error }
