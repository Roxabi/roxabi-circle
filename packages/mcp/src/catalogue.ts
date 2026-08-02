import type { z } from 'zod'
import { checkInputBudget } from './budget'
import { PublicToolError, stableStringify, toPublicToolError } from './publicErrors'

/** Descriptive only — NEVER authorization. */
export type ToolEffect = 'read' | 'write'

/** Descriptive only — NEVER authorization; real auth stays in handler / API. */
export type ToolAuthHint = 'none' | 'api_key'

export type ToolContext = {
  /** Reserved for app-supplied env-derived data; package does not log secrets. */
  env?: Record<string, string | undefined>
}

/**
 * Typed tool definition for createToolCatalogue.
 * `effect` / `auth` are metadata only — registerAll must not branch on them.
 * Use ZodTypeAny so app ToolDefs are assignable without variance fights.
 */
export type ToolDef = {
  name: string
  description: string
  input: z.ZodTypeAny
  output?: z.ZodTypeAny
  effect?: ToolEffect
  auth?: ToolAuthHint
  // biome-ignore lint/suspicious/noExplicitAny: FastMCP + Zod infer boundary — DEBT:fastmcp-zod-boundary
  execute: (input: any, ctx: ToolContext) => Promise<unknown>
}

/**
 * Duck-typed FastMCP-like surface — no fastmcp dependency in this package.
 * Uses a wide addTool signature so FastMCP (and fakes) are assignable without
 * fighting contravariant parameter checks on Tool.execute / parameters.
 */
export type ToolServer = {
  // biome-ignore lint/suspicious/noExplicitAny: intentional duck-type for FastMCP — DEBT:fastmcp-duck-type
  addTool: (tool: any) => void
}

export type ToolCatalogue = {
  /** Ordered names from ToolDef list (catalogue SSoT). */
  names: readonly string[]
  get: (name: string) => ToolDef | undefined
  /**
   * Assert live registered names match catalogue (order-insensitive).
   * Pass **runtime** names (tools/list / addTool capture) — never a twin of catalogue.names alone.
   */
  assertExact: (runtimeNames: readonly string[]) => void
  /** Sole intended registration path for apps. */
  registerAll: (server: ToolServer, ctx?: ToolContext) => void
  /** Underlying defs (read-only). */
  tools: readonly ToolDef[]
}

/**
 * Assert registered tool names equal an app-supplied allowlist (order-insensitive).
 * Kit purity is enforced by banlist scripts, not product lexicon here.
 */
export function assertToolsMatchAllowlist(names: string[], allowlist: readonly string[]): void {
  const sorted = [...names].sort()
  const expected = [...allowlist].sort()
  if (sorted.length !== expected.length || sorted.some((n, i) => n !== expected[i])) {
    throw new Error(
      `MCP tools must be exactly ${expected.join(',')}; got ${sorted.join(',') || '(none)'}`,
    )
  }
}

export function createToolCatalogue(tools: readonly ToolDef[]): ToolCatalogue {
  const byName = new Map<string, ToolDef>()
  for (const t of tools) {
    if (byName.has(t.name)) {
      throw new Error(`duplicate tool name in catalogue: ${t.name}`)
    }
    byName.set(t.name, t)
  }
  const names = tools.map((t) => t.name)

  return {
    names,
    tools,
    get(name: string) {
      return byName.get(name)
    },
    assertExact(runtimeNames: readonly string[]) {
      assertToolsMatchAllowlist([...runtimeNames], names)
    },
    registerAll(server: ToolServer, ctx: ToolContext = {}) {
      for (const tool of tools) {
        // Intentionally ignore tool.effect / tool.auth for authorization (SC12).
        void tool.effect
        void tool.auth

        server.addTool({
          name: tool.name,
          description: tool.description,
          parameters: tool.input,
          execute: async (args: unknown) => {
            const budget = checkInputBudget(args)
            if (!budget.ok) {
              throw new PublicToolError('INVALID_ARGUMENTS')
            }
            try {
              const result = await tool.execute(args, ctx)
              if (tool.output) {
                const parsed = tool.output.safeParse(result)
                if (!parsed.success) {
                  throw new PublicToolError('INTERNAL_ERROR')
                }
                return stableStringify(parsed.data)
              }
              if (typeof result === 'string') return result
              return stableStringify(result)
            } catch (err) {
              throw toPublicToolError(err)
            }
          },
        })
      }
    },
  }
}
