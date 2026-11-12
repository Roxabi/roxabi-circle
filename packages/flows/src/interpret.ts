import { type AfterGraph, graphHasCycle } from './graph'
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
  /** Approve tasks whose receipt is `waiting`. Not ready, not terminal. */
  waitingTaskIds?: string[]
  rollup: InterpretRollup
  stuck?: InterpretStuckCode
}

function cloneReceipts(receipts: ReceiptBundle, dropWaiting: boolean): ReceiptBundle {
  const tasks: Record<string, TaskReceipt> = {}
  for (const [id, rec] of Object.entries(receipts.tasks)) {
    if (dropWaiting && rec.outcome === 'waiting') continue
    tasks[id] = rec.approval ? { ...rec, approval: { ...rec.approval } } : { ...rec }
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
      if (!Object.hasOwn(tasks, dep)) return true
    }
  }
  return false
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
      if (Object.hasOwn(tasks, id)) continue
      const after = planTasks[id]?.after ?? []
      const blocked = after.some((dep) => {
        if (!Object.hasOwn(tasks, dep)) return false
        const outcome = tasks[dep]?.outcome
        return outcome === 'fail' || outcome === 'skip' || outcome === 'started'
      })
      if (!blocked) continue
      tasks[id] = { taskId: id, outcome: 'skip' }
      changed = true
    }
  }
}

function closed(receipts: ReceiptBundle, stuck: InterpretStuckCode): InterpretRunResult {
  return { receipts, readyTaskIds: [], waitingTaskIds: [], rollup: 'failed', stuck }
}

/**
 * Pure snapshot reducer — skip cascade, ready set, V0 rollup.
 *
 * @capability flows-interpret-run
 * @tag critical
 * @invariant interpret-skip-never-succeeded: rollup succeeded only when every sealedPlan.tasks id is present and ok; any fail, skip, or stuck is failed — Roxabi/roxabi-boilerplate-cf#30 §6
 * @invariant interpret-waiting-only-approve: waiting is produced only for an approve task; a waiting receipt on any other task fails closed WAITING_NOT_SUPPORTED — Roxabi/roxabi-boilerplate-cf#32
 * @invariant interpret-started-not-pending: a started receipt is not ready and not waiting; dependents cascade-skip; rollup is failed — Roxabi/roxabi-boilerplate-cf#229
 * @contract flows-interpret-port: interpretRun(view, receipts) -> { receipts, readyTaskIds, waitingTaskIds, rollup, stuck? }
 */
export function interpretRun(view: RunnerView, receipts: ReceiptBundle): InterpretRunResult {
  const planTasks = view.sealedPlan.tasks
  const taskIds = Object.keys(planTasks)

  const waitingOnNonApprove = Object.entries(receipts.tasks).some(([id, rec]) => {
    if (rec.outcome !== 'waiting') return false
    const task = planTasks[id]
    return !(task?.approve !== undefined && task.invoke === undefined && task.infer === undefined)
  })
  if (waitingOnNonApprove) {
    return closed(cloneReceipts(receipts, true), 'WAITING_NOT_SUPPORTED')
  }

  const out = cloneReceipts(receipts, false)

  if (hasUnknownAfter(planTasks)) {
    return closed(out, 'UNKNOWN_TASK_EDGE')
  }
  if (graphHasCycle(planTasks)) {
    return closed(out, 'CYCLE')
  }

  cascadeSkips(taskIds, planTasks, out.tasks)

  const waitingTaskIds = taskIds.filter((id) => out.tasks[id]?.outcome === 'waiting')

  const readyTaskIds = taskIds.filter((id) => {
    if (Object.hasOwn(out.tasks, id)) return false
    const after = planTasks[id]?.after ?? []
    return after.every((dep) => Object.hasOwn(out.tasks, dep) && out.tasks[dep]?.outcome === 'ok')
  })

  const pendingRemain = taskIds.some(
    (id) => !(Object.hasOwn(out.tasks, id) || readyTaskIds.includes(id)),
  )
  const hasFail = taskIds.some(
    (id) => Object.hasOwn(out.tasks, id) && out.tasks[id]?.outcome === 'fail',
  )
  const hasSkip = taskIds.some(
    (id) => Object.hasOwn(out.tasks, id) && out.tasks[id]?.outcome === 'skip',
  )
  const hasStarted = taskIds.some(
    (id) => Object.hasOwn(out.tasks, id) && out.tasks[id]?.outcome === 'started',
  )

  let stuck: InterpretStuckCode | undefined
  if (readyTaskIds.length === 0 && pendingRemain && !hasFail && waitingTaskIds.length === 0) {
    stuck = 'DAG_STUCK'
  }

  const allPresentOk = taskIds.every(
    (id) => Object.hasOwn(out.tasks, id) && out.tasks[id]?.outcome === 'ok',
  )
  const rollup: InterpretRollup =
    stuck || hasFail || hasSkip || hasStarted ? 'failed' : allPresentOk ? 'succeeded' : 'running'

  return stuck
    ? { receipts: out, readyTaskIds, waitingTaskIds, rollup, stuck }
    : { receipts: out, readyTaskIds, waitingTaskIds, rollup }
}
