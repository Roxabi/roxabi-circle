import { DEFAULT_INFER_MAX_TOKENS } from './constants'
import type { PlanDocument } from './schema'

/** Static upper bound on declared infer tokens (check + snapshot share this). */
export function staticTokenBudget(plan: PlanDocument): number {
  let sum = 0
  for (const task of Object.values(plan.tasks)) {
    if (task.infer) {
      sum += task.infer.max_tokens ?? plan.plan.max_tokens ?? DEFAULT_INFER_MAX_TOKENS
    }
  }
  return sum
}
