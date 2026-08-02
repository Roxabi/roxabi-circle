import { INPUT_BUDGET } from './agentWire'

export type BudgetFailure = {
  ok: false
  reason: 'depth' | 'visited' | 'array' | 'key'
}

export type BudgetOk = { ok: true }

/**
 * Fail-closed walk of tool input before handler body.
 * Limits from agentWire INPUT_BUDGET.
 */
export function checkInputBudget(
  value: unknown,
  limits: typeof INPUT_BUDGET = INPUT_BUDGET,
): BudgetOk | BudgetFailure {
  let visited = 0

  const walk = (v: unknown, depth: number): BudgetOk | BudgetFailure => {
    if (depth > limits.maxDepth) return { ok: false, reason: 'depth' }
    visited += 1
    if (visited > limits.maxVisitedValues) return { ok: false, reason: 'visited' }

    if (v === null || typeof v !== 'object') return { ok: true }

    if (Array.isArray(v)) {
      if (v.length > limits.maxArrayLength) return { ok: false, reason: 'array' }
      for (const item of v) {
        const r = walk(item, depth + 1)
        if (!r.ok) return r
      }
      return { ok: true }
    }

    for (const [key, child] of Object.entries(v as Record<string, unknown>)) {
      if (key.length > limits.maxKeyLength) return { ok: false, reason: 'key' }
      const r = walk(child, depth + 1)
      if (!r.ok) return r
    }
    return { ok: true }
  }

  return walk(value, 0)
}
