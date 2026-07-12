import { parseBearer } from '@gosilex/auth'

export type McpToolName = 'ping' | 'whoami'

/** Allowlist — kit MCP tools only. Keep in sync with apps/mcp-example registration. */
export const MCP_TOOL_NAMES: McpToolName[] = ['ping', 'whoami']

export function assertNoShareTools(names: string[]): void {
  for (const n of names) {
    if (n.startsWith('share_') || n.includes('artifact')) {
      throw new Error(`product MCP tool forbidden in kit: ${n}`)
    }
  }
}

/** Assert exact kit allowlist (order-insensitive). */
export function assertExactKitTools(names: string[]): void {
  assertNoShareTools(names)
  const sorted = [...names].sort()
  const expected = [...MCP_TOOL_NAMES].sort()
  if (sorted.length !== expected.length || sorted.some((n, i) => n !== expected[i])) {
    throw new Error(`MCP tools must be exactly ${expected.join(',')}; got ${sorted.join(',')}`)
  }
}

export function extractBearerFromEnv(env: Record<string, string | undefined>): string | null {
  return (
    parseBearer(env.AUTHORIZATION ? `Bearer ${env.AUTHORIZATION}` : null) ??
    (env.API_KEY?.startsWith('sk_') ? env.API_KEY : null) ??
    null
  )
}

export async function handlePing(): Promise<{ ok: true }> {
  return { ok: true }
}

/**
 * Presence-only whoami for local stdio smoke.
 * Does **not** verify the key against example-api / D1 — reports env key presence only.
 */
export async function handleWhoami(apiKey: string | null): Promise<{
  keyPresent: boolean
  keyPrefix: string | null
  /** Always false until wired to a real Bearer verify against the API. */
  verified: boolean
}> {
  if (!apiKey) return { keyPresent: false, keyPrefix: null, verified: false }
  return { keyPresent: true, keyPrefix: apiKey.slice(0, 8), verified: false }
}
