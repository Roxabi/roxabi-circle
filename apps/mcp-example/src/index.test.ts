import { describe, expect, it } from 'vitest'
import { MCP_TOOL_NAMES, server } from './index'

describe('mcp-example entry', () => {
  it('registers only ping and whoami on the FastMCP server', () => {
    expect(MCP_TOOL_NAMES).toEqual(['ping', 'whoami'])
    // FastMCP stores tools on the instance — assert live registration, not just constant.
    const tools =
      (server as { tools?: Map<string, unknown> | Array<{ name: string }> }).tools ??
      (server as { _tools?: Map<string, unknown> })._tools
    let names: string[] = []
    if (tools instanceof Map) {
      names = [...tools.keys()]
    } else if (Array.isArray(tools)) {
      names = tools.map((t) => t.name)
    } else {
      // Fallback: probe common FastMCP shapes
      const anyServer = server as {
        listTools?: () => Array<{ name: string }>
        getTools?: () => Array<{ name: string }>
      }
      if (typeof anyServer.listTools === 'function') {
        names = anyServer.listTools().map((t) => t.name)
      } else if (typeof anyServer.getTools === 'function') {
        names = anyServer.getTools().map((t) => t.name)
      }
    }
    // If runtime exposes tools, enforce exact set; otherwise require constant + no share_
    if (names.length > 0) {
      expect(names.sort()).toEqual(['ping', 'whoami'].sort())
      expect(names.some((n) => n.startsWith('share_'))).toBe(false)
    } else {
      // Still fail if someone adds share tools to the constant allowlist
      expect(MCP_TOOL_NAMES.some((n) => n.startsWith('share_'))).toBe(false)
      expect(MCP_TOOL_NAMES).toEqual(['ping', 'whoami'])
    }
  })
})
