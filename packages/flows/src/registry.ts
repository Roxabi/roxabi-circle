export type FlowToolDefinition = {
  name: string
  description?: string
  effect?: 'read' | 'write' | 'external'
}

export type ToolRegistry = {
  /** Caller label (must match grant.registryVersion). */
  version: string
  /**
   * Content fingerprint of sorted tool names (FNV-1a hex).
   * Seal this on the run snapshot so version label alone cannot rebind a different tool set.
   */
  contentDigest: string
  tools: ReadonlyMap<string, FlowToolDefinition>
}

const TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/

function digestToolNames(names: readonly string[]): string {
  const s = [...names].sort().join('\0')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

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
    if (map.has(t.name)) {
      throw new Error(`duplicate tool in registry: ${t.name}`)
    }
    map.set(t.name, Object.freeze({ ...t }))
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
  return Object.freeze({
    version,
    contentDigest: digestToolNames([...frozenMap.keys()]),
    tools: frozenTools,
  })
}

export function registryHas(registry: ToolRegistry, name: string): boolean {
  return registry.tools.has(name)
}

export function registryToolNames(registry: ToolRegistry): string[] {
  return [...registry.tools.keys()].sort()
}
