import { z } from 'zod'
import type { CapabilityGrant } from './authority'
import { MAX_PERMIT_TOOLS } from './constants'

const toolNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)

/** Runtime validation for CapabilityGrant (caller-supplied plain objects). */
export const capabilityGrantSchema = z
  .object({
    orgId: z.string().min(1).max(256),
    allowedTools: z.array(toolNameSchema).max(MAX_PERMIT_TOOLS),
    registryVersion: z.string().min(1).max(256),
    /** Explicit infer capability — never defaulted to true. */
    allowsInfer: z.boolean(),
  })
  .strict()

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
