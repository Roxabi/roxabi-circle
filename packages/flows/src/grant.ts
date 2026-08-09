import { z } from 'zod'
import type { CapabilityGrant } from './authority'
import { MAX_PERMIT_TOOLS } from './constants'

const toolNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)

/**
 * Prototype-shaped keys. `.strict()` alone does not cover these: `JSON.parse` creates an own
 * `__proto__` key that zod does not report as unknown, so it must be rejected before the object
 * schema runs. Same family as `assertArgsShape` in `schema.ts`.
 */
const FORBIDDEN_GRANT_KEY = /^__|^(?:constructor|prototype)$/i

function rejectPrototypeKeys(input: unknown, ctx: z.RefinementCtx): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return
  for (const k of Object.getOwnPropertyNames(input)) {
    if (FORBIDDEN_GRANT_KEY.test(k)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `grant key forbidden: ${k}` })
    }
  }
}

/** Runtime validation for CapabilityGrant (caller-supplied plain objects). */
export const capabilityGrantSchema = z
  .unknown()
  .superRefine(rejectPrototypeKeys)
  .pipe(
    z
      .object({
        orgId: z.string().min(1).max(256),
        allowedTools: z.array(toolNameSchema).max(MAX_PERMIT_TOOLS),
        registryVersion: z.string().min(1).max(256),
        /** Explicit infer capability — never defaulted to true. */
        allowsInfer: z.boolean(),
      })
      .strict(),
  )

/**
 * Shape validation only. Grant **provenance** is an app-layer duty (apps mint from server
 * session / org module policy, residual until #31) and is deliberately not claimed here —
 * ADR-0005 D4 § Authority split.
 *
 * @capability flows-grant-parse
 * @tag security
 * @invariant grant-shape-fully-explicit: a CapabilityGrant is accepted only as a strict object with every field explicit — allowsInfer is never defaulted or coerced, unknown and prototype-shaped keys are rejected — ADR-0005 D4 § Authority split
 */
export function parseCapabilityGrant(
  input: unknown,
): { ok: true; grant: CapabilityGrant } | { ok: false; message: string } {
  const r = capabilityGrantSchema.safeParse(input)
  if (!r.success) {
    return {
      ok: false,
      message: r.error.issues.map((i) => i.message).join('; ') || 'grant invalid',
    }
  }
  return {
    ok: true,
    grant: {
      orgId: r.data.orgId,
      allowedTools: [...r.data.allowedTools],
      registryVersion: r.data.registryVersion,
      allowsInfer: r.data.allowsInfer,
    },
  }
}
