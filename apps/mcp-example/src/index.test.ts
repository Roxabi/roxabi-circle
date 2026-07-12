import { describe, expect, it } from 'vitest'
import { MCP_TOOL_NAMES } from './index'

describe('mcp-example entry', () => {
  it('registers only ping and whoami', () => {
    expect(MCP_TOOL_NAMES).toEqual(['ping', 'whoami'])
    expect(MCP_TOOL_NAMES.some((n) => n.startsWith('share_'))).toBe(false)
  })
})
