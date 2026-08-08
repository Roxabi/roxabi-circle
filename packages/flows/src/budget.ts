import { DEFAULT_INFER_MAX_TOKENS } from './constants'
import type { PlanDocument } from './schema'

/**
 * Static upper bound on declared infer tokens (check + snapshot share this).
 *
 * Contract:
 * - **plan.max_tokens** = total ceiling across all infer tasks (required when any infer).
 * - Per-task default when `infer.max_tokens` omitted = `DEFAULT_INFER_MAX_TOKENS` only
 *   (never re-use plan.max_tokens as per-task default — that made multi-infer always fail).
 */
export function staticTokenBudget(plan: PlanDocument): number {
  let sum = 0
  for (const task of Object.values(plan.tasks)) {
    if (task.infer) {
      sum += task.infer.max_tokens ?? DEFAULT_INFER_MAX_TOKENS
    }
  }
  return sum
}

/** Hard runtime ceiling: min(static sum, plan.max_tokens when set). */
export function hardMaxTokens(plan: PlanDocument): number {
  const staticSum = staticTokenBudget(plan)
  if (plan.plan.max_tokens !== undefined) {
    return Math.min(staticSum, plan.plan.max_tokens)
  }
  return staticSum
}
