import {
  PUBLIC_TOOL_ERROR_CODES,
  PUBLIC_TOOL_ERROR_MESSAGES,
  type PublicToolErrorCode,
} from './agentWire'

export type PublicToolErrorBody = {
  code: PublicToolErrorCode
  message: string
}

/**
 * Infra-channel tool error. Never put secrets, stacks, or raw exception text
 * in `message` — use catalogue messages only.
 */
export class PublicToolError extends Error {
  readonly code: PublicToolErrorCode
  readonly body: PublicToolErrorBody

  constructor(code: PublicToolErrorCode, message?: string) {
    const msg = message ?? PUBLIC_TOOL_ERROR_MESSAGES[code]
    super(msg)
    this.name = 'PublicToolError'
    this.code = code
    this.body = { code, message: msg }
  }

  toJSON(): PublicToolErrorBody {
    return this.body
  }
}

export function isPublicToolErrorCode(value: string): value is PublicToolErrorCode {
  return (PUBLIC_TOOL_ERROR_CODES as readonly string[]).includes(value)
}

/** Map unknown throw → catalogue INTERNAL_ERROR (no raw message leak). */
export function toPublicToolError(err: unknown): PublicToolError {
  if (err instanceof PublicToolError) return err
  return new PublicToolError('INTERNAL_ERROR')
}

/** Stable JSON for agent-facing tool text (sorted keys at top level + nested objects). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortKeys)
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key])
  }
  return out
}
