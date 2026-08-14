import type { ReceiptBundle, TaskReceipt } from './receipts'
import type { RunnerView } from './runner-view'

export type InterpretStuckCode =
  | 'CYCLE'
  | 'UNKNOWN_TASK_EDGE'
  | 'DAG_STUCK'
  | 'WAITING_NOT_SUPPORTED'

export type InterpretRollup = 'running' | 'succeeded' | 'failed'

export type InterpretRunResult = {
  receipts: ReceiptBundle
  readyTaskIds: string[]
  rollup: InterpretRollup
  stuck?: InterpretStuckCode
}

type AfterGraph = Readonly<Record<string, { readonly after?: readonly string[] }>>

function cloneWithoutWaiting(receipts: ReceiptBundle): ReceiptBundle {
  const tasks: Record<string, TaskReceipt> = {}
  for (const [id, rec] of Object.entries(receipts.tasks)) {
    if (rec.outcome === 'waiting') continue
    tasks[id] = { ...rec }
  }
  return {
    receiptVersion: 1,
    tokensUsed: receipts.tokensUsed,
    tasks,
  }
}

function hasUnknownAfter(tasks: AfterGraph): boolean {
  for (const task of Object.values(tasks)) {
    for (const dep of task.after ?? []) {
      if (!(dep in tasks)) return true
    }
  }
  return false
}

/** Kahn leftover — same walk as `findCycle` in check.ts (unknown edges ignored). */
function graphHasCycle(tasks: AfterGraph): boolean {
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

function cascadeSkips(
  taskIds: readonly string[],
  planTasks: AfterGraph,
  tasks: Record<string, TaskReceipt>,
): void {
  let changed = true
  while (changed) {
    changed = false
    for (const id of taskIds) {
      if (tasks[id]) continue
      const after = planTasks[id]?.after ?? []
      const blocked = after.some((dep) => {
        const outcome = tasks[dep]?.outcome
        return outcome === 'fail' || outcome === 'skip'
      })
      if (!blocked) continue
      tasks[id] = { taskId: id, outcome: 'skip' }
      changed = true
    }
  }
}

function closed(receipts: ReceiptBundle, stuck: InterpretStuckCode): InterpretRunResult {
  return { receipts, readyTaskIds: [], rollup: 'failed', stuck }
}

/**
 * Pure snapshot reducer — skip cascade, ready set, V0 rollup. Never emits `waiting`.
 *
 * @capability flows-interpret-run
 * @tag critical
 * @invariant interpret-skip-never-succeeded: rollup succeeded only when every sealedPlan.tasks id is present and ok; any fail, skip, or stuck is failed — #30 §6
 * @invariant interpret-waiting-not-produced: interpretRun never writes outcome waiting; input waiting fails closed WAITING_NOT_SUPPORTED — #30 §6
 * @contract flows-interpret-port: interpretRun(view, receipts) -> { receipts, readyTaskIds, rollup, stuck? }
 */
export function interpretRun(view: RunnerView, receipts: ReceiptBundle): InterpretRunResult {
  const planTasks = view.sealedPlan.tasks
  const taskIds = Object.keys(planTasks)
  const out = cloneWithoutWaiting(receipts)

  if (Object.values(receipts.tasks).some((rec) => rec.outcome === 'waiting')) {
    return closed(out, 'WAITING_NOT_SUPPORTED')
  }
  if (hasUnknownAfter(planTasks)) {
    return closed(out, 'UNKNOWN_TASK_EDGE')
  }

  const hadExisting = Object.keys(out.tasks).length > 0
  cascadeSkips(taskIds, planTasks, out.tasks)

  const readyTaskIds = taskIds.filter((id) => {
    if (out.tasks[id]) return false
    const after = planTasks[id]?.after ?? []
    return after.every((dep) => out.tasks[dep]?.outcome === 'ok')
  })

  const pendingRemain = taskIds.some((id) => !out.tasks[id] && !readyTaskIds.includes(id))
  const hasFail = taskIds.some((id) => out.tasks[id]?.outcome === 'fail')
  const hasSkip = taskIds.some((id) => out.tasks[id]?.outcome === 'skip')

  let stuck: InterpretStuckCode | undefined
  if (readyTaskIds.length === 0 && pendingRemain) {
    if (graphHasCycle(planTasks) && !hadExisting) stuck = 'CYCLE'
    else if (!hasFail) stuck = 'DAG_STUCK'
  }

  const allPresentOk = taskIds.every((id) => out.tasks[id]?.outcome === 'ok')
  const rollup: InterpretRollup =
    stuck || hasFail || hasSkip ? 'failed' : allPresentOk ? 'succeeded' : 'running'

  return stuck
    ? { receipts: out, readyTaskIds, rollup, stuck }
    : { receipts: out, readyTaskIds, rollup }
}
