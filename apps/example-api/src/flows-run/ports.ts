/** Dogfood invoke (echo) + InferPort test-double. Workflow binds inferMock. */

/**
 * Echo port. Binding resolution (Roxabi/roxabi-boilerplate-cf#232) runs in `driveFlowRun` → `runInvokeStep`
 * via `resolveWholeBindings` before this port is called — do not re-resolve
 * or read env here.
 */
export async function invokeEcho(task: {
  taskId: string
  tool: string
  args?: Record<string, unknown>
}): Promise<{ output?: string }> {
  if (task.tool !== 'echo') throw new Error('UNKNOWN_TOOL')
  const text = typeof task.args?.text === 'string' ? task.args.text : ''
  return { output: text.slice(0, 4096) }
}

/** InferPort test-double — no provider. Shape 2 replaces this with complete(). */
export async function inferMock(_task: {
  taskId: string
  prompt: string
  max_tokens?: number
  model?: string
}): Promise<{ text: string; tokens: number }> {
  return { text: 'ok', tokens: 1 }
}
