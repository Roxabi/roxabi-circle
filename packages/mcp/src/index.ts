import { parseBearer } from '@gosilex/auth'

export type McpToolName = 'ping' | 'whoami'

export const MCP_TOOL_NAMES: McpToolName[] = ['ping', 'whoami']

export function assertNoShareTools(names: string[]): void {
  for (const n of names) {
    if (n.startsWith('share_') || n.includes('artifact')) {
      throw new Error(`product MCP tool forbidden in kit: ${n}`)
    }
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

export async function handleWhoami(apiKey: string | null): Promise<{
  authenticated: boolean
  keyPrefix: string | null
}> {
  if (!apiKey) return { authenticated: false, keyPrefix: null }
  return { authenticated: true, keyPrefix: apiKey.slice(0, 8) }
}
