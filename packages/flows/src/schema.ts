import { z } from 'zod'
import { FLOWS_VERSION, MAX_PERMIT_TOOLS, MAX_PLAN_TASKS, MAX_PLAN_TOTAL_TOKENS } from './constants'

const nonEmptyId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'id must be alphanumeric/underscore/hyphen')

const invokeBodySchema = z
  .object({
    tool: z.string().min(1).max(128),
    args: z.record(z.unknown()).optional(),
  })
  .strict()

const inferBodySchema = z
  .object({
    prompt: z.string().min(1).max(32_000),
    max_tokens: z.number().int().positive().max(100_000).optional(),
    model: z.string().min(1).max(256).optional(),
  })
  .strict()

/** Exactly one of invoke | infer. `agent` rejected under .strict(). */
export const planTaskSchema = z
  .object({
    after: z.array(nonEmptyId).max(MAX_PLAN_TASKS).optional(),
    invoke: invokeBodySchema.optional(),
    infer: inferBodySchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasInvoke = val.invoke !== undefined
    const hasInfer = val.infer !== undefined
    if (hasInvoke === hasInfer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'task must have exactly one of invoke | infer (agent deferred in v0)',
      })
    }
  })

export type PlanTask = z.infer<typeof planTaskSchema>

export const planPermitsSchema = z
  .object({
    tools: z.array(z.string().min(1).max(128)).max(MAX_PERMIT_TOOLS),
  })
  .strict()

export type PlanPermits = z.infer<typeof planPermitsSchema>

export const planDocumentSchema = z
  .object({
    flows: z.literal(FLOWS_VERSION),
    plan: z
      .object({
        id: nonEmptyId,
        description: z.string().max(2000).optional(),
        model: z.string().min(1).max(256).optional(),
        max_tokens: z.number().int().positive().max(MAX_PLAN_TOTAL_TOKENS).optional(),
      })
      .strict(),
    permits: planPermitsSchema,
    tasks: z.record(nonEmptyId, planTaskSchema).superRefine((tasks, ctx) => {
      const n = Object.keys(tasks).length
      if (n < 1 || n > MAX_PLAN_TASKS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `tasks must have 1..${MAX_PLAN_TASKS} entries (got ${n})`,
        })
      }
    }),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const hasInfer = Object.values(doc.tasks).some((t) => t.infer !== undefined)
    if (hasInfer && doc.plan.max_tokens === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'plan.max_tokens is required when any task uses infer',
        path: ['plan', 'max_tokens'],
      })
    }
  })

export type PlanDocument = z.infer<typeof planDocumentSchema>

export type SafeParsePlanResult = ReturnType<typeof planDocumentSchema.safeParse>

export function parsePlanDocument(input: unknown): PlanDocument {
  return planDocumentSchema.parse(input)
}

export function safeParsePlanDocument(input: unknown): SafeParsePlanResult {
  return planDocumentSchema.safeParse(input)
}
