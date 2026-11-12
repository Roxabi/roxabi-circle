/**
 * Whole-value task-output bindings for invoke.args (Roxabi/roxabi-boilerplate-cf#232).
 * Grammar: only `${{ tasks.<id>.output }}` as an entire string leaf.
 */

export const WHOLE_BINDING_RE = /^\$\{\{\s*tasks\.([A-Za-z][A-Za-z0-9_-]*)\.output\s*\}\}$/

/** Case-insensitive key denylist for env/secret-shaped arg keys. Values are not scanned. */
export const ARG_KEY_FORBIDDEN_RE =
  /(^|_)(env|secret|token|password|passwd|api_key|apikey|authorization|credential|private_key)($|_)/i

export class BindingUnresolvedError extends Error {
  readonly code = 'BINDING_UNRESOLVED' as const
  constructor(readonly taskId: string) {
    super(`binding unresolved: tasks.${taskId}.output`)
    this.name = 'BindingUnresolvedError'
  }
}

export type BindingWalkIssue = {
  code: 'BINDING_NOT_WHOLE' | 'ARG_KEY_FORBIDDEN'
  message: string
  /** Path under `args` (e.g. `text` or `nested.0`). Empty when the args root itself. */
  path: string
}

function looksLikeBinding(value: string): boolean {
  return value.includes('${{')
}

/** Collect binding target task ids from args (deduped, insertion order). */
export function bindingTaskIds(args: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  walkCollect(args, seen, out)
  return out
}

function walkCollect(value: unknown, seen: Set<string>, out: string[]): void {
  if (typeof value === 'string') {
    const m = WHOLE_BINDING_RE.exec(value)
    if (m?.[1] && !seen.has(m[1])) {
      seen.add(m[1])
      out.push(m[1])
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkCollect(item, seen, out)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkCollect(v, seen, out)
    }
  }
}

/** Check-time walk: forbidden keys + non-whole binding strings. */
export function walkArgsBindings(args: unknown): BindingWalkIssue[] {
  const issues: BindingWalkIssue[] = []
  walkIssues(args, '', issues)
  return issues
}

function noteNotWhole(path: string, issues: BindingWalkIssue[]): void {
  issues.push({
    code: 'BINDING_NOT_WHOLE',
    message: 'invoke.args binding must be a whole tasks.<id>.output placeholder value',
    path,
  })
}

function walkStringLeaf(value: string, path: string, issues: BindingWalkIssue[]): void {
  if (looksLikeBinding(value) && !WHOLE_BINDING_RE.test(value)) noteNotWhole(path, issues)
}

function walkArrayLeaves(value: unknown[], path: string, issues: BindingWalkIssue[]): void {
  for (let i = 0; i < value.length; i++) {
    walkIssues(value[i], path ? `${path}.${i}` : String(i), issues)
  }
}

function walkObjectLeaves(
  value: Record<string, unknown>,
  path: string,
  issues: BindingWalkIssue[],
): void {
  for (const [k, v] of Object.entries(value)) {
    const child = path ? `${path}.${k}` : k
    if (ARG_KEY_FORBIDDEN_RE.test(k)) {
      issues.push({
        code: 'ARG_KEY_FORBIDDEN',
        message: `invoke.args key forbidden: ${k}`,
        path: child,
      })
    }
    walkIssues(v, child, issues)
  }
}

function walkIssues(value: unknown, path: string, issues: BindingWalkIssue[]): void {
  if (typeof value === 'string') {
    walkStringLeaf(value, path, issues)
    return
  }
  if (Array.isArray(value)) {
    walkArrayLeaves(value, path, issues)
    return
  }
  if (value !== null && typeof value === 'object') {
    walkObjectLeaves(value as Record<string, unknown>, path, issues)
  }
}

/**
 * Substitute whole-value bindings. Does not read env.
 * Missing or non-string output → BindingUnresolvedError (fail closed).
 */
export function resolveWholeBindings(
  args: Record<string, unknown> | undefined,
  outputs: ReadonlyMap<string, string | undefined>,
): Record<string, unknown> | undefined {
  if (args === undefined) return undefined
  return resolveValue(args, outputs) as Record<string, unknown>
}

function resolveValue(value: unknown, outputs: ReadonlyMap<string, string | undefined>): unknown {
  if (typeof value === 'string') {
    const m = WHOLE_BINDING_RE.exec(value)
    if (!m?.[1]) return value
    const out = outputs.get(m[1])
    if (typeof out !== 'string') throw new BindingUnresolvedError(m[1])
    return out
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, outputs))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveValue(v, outputs)
    }
    return result
  }
  return value
}

/** Sorted union of authored `after` and binding deps (deduped). */
export function unionAfterWithBindings(
  authored: readonly string[] | undefined,
  args: unknown,
): string[] | undefined {
  const derived = args === undefined || args === null ? [] : bindingTaskIds(args)
  if ((authored === undefined || authored.length === 0) && derived.length === 0) {
    return undefined
  }
  return [...new Set([...(authored ?? []), ...derived])].sort()
}

export type PlanTasksForBindings = Readonly<
  Record<string, { after?: readonly string[]; invoke?: { args?: unknown } | undefined }>
>

/** Check-time issues for invoke.args bindings + derived edges (codes only). */
export function collectInvokeBindingIssues(tasks: PlanTasksForBindings): Array<{
  code: 'BINDING_NOT_WHOLE' | 'ARG_KEY_FORBIDDEN' | 'UNKNOWN_TASK_EDGE'
  message: string
  path: string
}> {
  const issues: Array<{
    code: 'BINDING_NOT_WHOLE' | 'ARG_KEY_FORBIDDEN' | 'UNKNOWN_TASK_EDGE'
    message: string
    path: string
  }> = []
  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.invoke?.args === undefined) continue
    for (const issue of walkArgsBindings(task.invoke.args)) {
      issues.push({
        code: issue.code,
        message: issue.message,
        path: issue.path
          ? `tasks.${taskId}.invoke.args.${issue.path}`
          : `tasks.${taskId}.invoke.args`,
      })
    }
    for (const dep of bindingTaskIds(task.invoke.args)) {
      if (!Object.hasOwn(tasks, dep)) {
        issues.push({
          code: 'UNKNOWN_TASK_EDGE',
          message: `task ${taskId} binding: unknown task ${dep}`,
          path: `tasks.${taskId}.invoke.args`,
        })
      }
    }
  }
  return issues
}
