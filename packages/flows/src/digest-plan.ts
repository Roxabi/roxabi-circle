import { fnv1a32Hex, stableStringify } from './digest'
import type { PlanDocument } from './schema'

/**
 * Content-address index of a plan (FNV-1a 32-bit hex).
 * **Not** a cryptographic integrity control — sealedPlan body is authoritative.
 */
export function digestPlan(plan: PlanDocument): string {
  return fnv1a32Hex(stableStringify(plan))
}
