import { z } from '@hono/zod-openapi'

/** Extra keys (`allowedTools`, `grant`) fail closed — grant is minted server-side. */
export const createPlanBodySchema = z.object({ yaml: z.string() }).strict()
export const setEnabledBodySchema = z.object({ enabled: z.boolean() }).strict()
/** Extra keys (`yaml`, `grant`) fail closed — snapshot is from stored plan_json. */
export const createRunBodySchema = z.object({}).strict()

/** Empty strict body — cancel carries no client fields. */
export const cancelRunBodySchema = z.object({}).strict()

/** Extra keys fail closed — the D1 row, not the body, is the authorization. */
export const approvalDecisionBodySchema = z
  .object({ decision: z.enum(['approved', 'rejected']) })
  .strict()
