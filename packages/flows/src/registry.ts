import { fnv1a32Hex } from './digest'
import { markKitRegistry } from './provenance'

/**
 * Declared authority class of a registry tool: may this tool ever enter a Capability Grant?
 *
 * `'mintable'` — `mintCapabilityGrant` puts it in the minted ceiling, and `checkPlan` accepts it
 * there. `'never'` — it can never be in a grant, whatever the tool does.
 *
 * Deliberately **not** an effect taxonomy and **not** optional. An effect word invites the wrong
 * question ("is this tool read-only?") whose safe-sounding answer widens the ceiling; the field
 * asks the authority question instead ("may any run of the org invoke this without further
 * policy?"). Required, because an omitted decision is not a decision — and because a product
 * still passing the old `effect` key then fails to compile instead of silently minting nothing.
 *
 * Unrelated to the `@kit/mcp` `ToolEffect` hint (`packages/mcp/src/catalogue.ts`), which is
 * descriptive only and NEVER authorization (Roxabi/roxabi-boilerplate-cf#243). Also unrelated to `FlowToolEffect` below —
 * that is a kit-side **retry** hint only (Roxabi/roxabi-boilerplate-cf#234), never an input to mint / check / digest.
 */
export type ToolGrantClass = 'mintable' | 'never'

/**
 * Kit-side scheduling hint: may `runInvokeStep` ask Cloudflare Workflows for retries?
 *
 * `'read'` — idempotent enough for `retries.limit: 3`. `'write'` — no kit retry.
 * Absent or any other value at construction is stored as `'write'` (fail closed).
 *
 * **Not** authority: never enters `mintCapabilityGrant`, `checkPlan` allowlists, or
 * `contentDigest` (digest stays `name:grantClass`). Do not conflate with `grantClass` or with
 * the `@kit/mcp` descriptive `effect` (Roxabi/roxabi-boilerplate-cf#243 / Roxabi/roxabi-boilerplate-cf#234).
 */
export type FlowToolEffect = 'read' | 'write'

export type FlowToolDefinition = {
  name: string
  description?: string
  /** Declared, required: `'mintable'` may enter a grant, `'never'` may not. */
  grantClass: ToolGrantClass
  /**
   * Optional retry hint. Omitted / unknown → stored `'write'` (no retry).
   * Never an authority input — see `FlowToolEffect`.
   */
  effect?: FlowToolEffect
  /**
   * When true, invoke receipts replace tool text with `REDACTED_OUTPUT_MARKER` at D1 write.
   * Absent → false. Not sealed into contentDigest or RunnerView (Roxabi/roxabi-boilerplate-cf#231).
   */
  sensitiveOutput?: boolean
}

export type ToolRegistry = {
  /** Caller label (must match grant.registryVersion). */
  version: string
  /**
   * Content fingerprint of the sorted `name:grantClass` pairs (FNV-1a hex).
   * Seal this on the run snapshot so a version label alone cannot rebind a different tool set
   * **or a different power for the same names** — reclassifying a tool changes the digest.
   * Flipping `effect` alone must **not** move this digest (Roxabi/roxabi-boilerplate-cf#234).
   */
  contentDigest: string
  tools: ReadonlyMap<string, FlowToolDefinition>
}

const TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/
const GRANT_CLASSES: readonly ToolGrantClass[] = ['mintable', 'never']

/** Names AND grant classes: the digest must move when a tool is reclassified. Effect is out. */
function digestToolSurface(defs: readonly FlowToolDefinition[]): string {
  return fnv1a32Hex(
    defs
      .map((def) => `${def.name}:${def.grantClass}`)
      .sort()
      .join('\0'),
  )
}

/** Fail closed: only the exact string `'read'` is read; everything else is write. */
function projectEffect(raw: unknown): FlowToolEffect {
  return raw === 'read' ? 'read' : 'write'
}

/**
 * Flows tool surface: declarations only (no handler, no schema) consumed by `mintCapabilityGrant`
 * and `checkPlan`, plus an optional `effect` retry hint sealed onto `RunnerView.toolEffects`.
 *
 * Forked from MCP `createToolCatalogue` **by decision**, not by drift — ADR-0005 D6 amendment
 * (2026-09-18): that factory owns executable tools (Zod input/output + `execute` + server
 * registration), this one owns an authority classification. If the fork is ever unified it is a
 * promote that replaces both callers — never a third factory or a helper sitting beside them (M-04).
 *
 * Entries are **projected**, not spread: an unknown key (an `execute` handler, a stray MCP field)
 * never reaches the authority surface. `effect` is projected as a retry hint only — absent or
 * any non-`'read'` value becomes `'write'`; it is never an input to mint / check / digest (Roxabi/roxabi-boilerplate-cf#234).
 */
export function createToolRegistry(
  version: string,
  toolDefs: readonly FlowToolDefinition[],
): ToolRegistry {
  if (!version || version.trim() === '') {
    throw new Error('registry version is required')
  }
  const map = new Map<string, FlowToolDefinition>()
  for (const t of toolDefs) {
    if (!TOOL_NAME_RE.test(t.name)) {
      throw new Error(`invalid tool name in registry: ${t.name}`)
    }
    if (!GRANT_CLASSES.includes(t.grantClass)) {
      const got = typeof t.grantClass === 'string' ? `'${t.grantClass}'` : String(t.grantClass)
      throw new Error(
        `tool ${t.name} has no usable grant class: expected 'mintable' or 'never', got ${got}`,
      )
    }
    if (map.has(t.name)) {
      throw new Error(`duplicate tool in registry: ${t.name}`)
    }
    map.set(
      t.name,
      Object.freeze({
        name: t.name,
        ...(t.description === undefined ? {} : { description: t.description }),
        grantClass: t.grantClass,
        effect: projectEffect((t as { effect?: unknown }).effect),
        sensitiveOutput: t.sensitiveOutput === true,
      }),
    )
  }
  // Prevent post-create mutation (Object.freeze does not block Map.set).
  const frozenMap = new Map(map)
  const frozenTools: ReadonlyMap<string, FlowToolDefinition> = new Proxy(frozenMap, {
    get(target, prop, receiver) {
      if (prop === 'set' || prop === 'delete' || prop === 'clear') {
        return () => {
          throw new TypeError('registry tools map is frozen')
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value
    },
  })
  return markKitRegistry(
    Object.freeze({
      version,
      contentDigest: digestToolSurface([...frozenMap.values()]),
      tools: frozenTools,
    }),
  )
}

export function registryHas(registry: ToolRegistry, name: string): boolean {
  return registry.tools.has(name)
}

export function registryToolNames(registry: ToolRegistry): string[] {
  return [...registry.tools.keys()].sort()
}
