/** Dogfood invoke (echo) + InferPort mock. Workflow stays invoke-only. */

export async function invokeEcho(task: {
  taskId: string
  tool: string
  args?: Record<string, unknown>
}): Promise<{ output?: string }> {
  const text = typeof task.args?.text === 'string' ? task.args.text : ''
  return { output: text.slice(0, 4096) }
}

/** InferPort mock — T17 will use this. Export now so workflow can stay invoke-only. */
export async function inferMock(_task: {
  taskId: string
  prompt: string
  max_tokens?: number
  model?: string
}): Promise<{ text: string; tokens: number }> {
  return { text: 'ok', tokens: 1 }
}
