/** Shared Kahn cycle walk — checkPlan and interpretRun must use the same predicate. */

export type AfterGraph = Readonly<Record<string, { readonly after?: readonly string[] }>>

export function graphHasCycle(tasks: AfterGraph): boolean {
  const ids = Object.keys(tasks)
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of ids) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const [id, task] of Object.entries(tasks)) {
    for (const dep of task.after ?? []) {
      if (!indeg.has(dep)) continue
      adj.get(dep)?.push(id)
      indeg.set(id, (indeg.get(id) ?? 0) + 1)
    }
  }
  const q = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  let seen = 0
  while (q.length > 0) {
    const n = q.shift()
    if (!n) break
    seen++
    for (const m of adj.get(n) ?? []) {
      const next = (indeg.get(m) ?? 0) - 1
      indeg.set(m, next)
      if (next === 0) q.push(m)
    }
  }
  return seen !== ids.length
}

export function findCycle(tasks: AfterGraph): string | null {
  return graphHasCycle(tasks) ? 'task graph contains a cycle' : null
}
