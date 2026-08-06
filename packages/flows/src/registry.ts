export type FlowToolDefinition = {
  name: string
  description?: string
  effect?: 'read' | 'write' | 'external'
}

export type ToolRegistry = {
  version: string
  tools: ReadonlyMap<string, FlowToolDefinition>
}

export function createToolRegistry(
  version: string,
  tools: readonly FlowToolDefinition[],
): ToolRegistry {
  const map = new Map<string, FlowToolDefinition>()
  for (const t of tools) {
    if (map.has(t.name)) {
      throw new Error(`duplicate tool in registry: ${t.name}`)
    }
    map.set(t.name, t)
  }
  return { version, tools: map }
}

export function registryHas(registry: ToolRegistry, name: string): boolean {
  return registry.tools.has(name)
}

export function registryToolNames(registry: ToolRegistry): string[] {
  return [...registry.tools.keys()].sort()
}
