import { drizzle } from 'drizzle-orm/d1'

/** Create a Drizzle client bound to a D1 database. Table schemas live in kit package schema subpaths; apps compose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDb<TSchema extends Record<string, unknown>>(d1: unknown, schema: TSchema) {
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
