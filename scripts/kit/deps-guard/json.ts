/** Safe readers for parsed JSON from the network (never trust its shape). */

/** Value at `path` inside parsed JSON; undefined when any hop is missing or not an object. */
export function at(body: unknown, ...path: string[]): unknown {
  let cur: unknown = body
  for (const key of path) {
    if (cur === null || typeof cur !== 'object' || !(key in cur)) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** `at`, but only a string counts. */
export function str(body: unknown, ...path: string[]): string | undefined {
  const v = at(body, ...path)
  return typeof v === 'string' ? v : undefined
}
