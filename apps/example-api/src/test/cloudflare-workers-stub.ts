/** Node stand-in so FlowRunWorkflow can be constructed in Vitest. */
export class WorkflowEntrypoint<Env = unknown> {
  env: Env
  constructor(_ctx: unknown, env: Env) {
    this.env = env
  }
}
export type WorkflowEvent<T> = {
  payload: T
  timestamp: Date
  instanceId: string
}
export type WorkflowStep = {
  do: (...args: unknown[]) => Promise<unknown>
  waitForEvent: (name: string, options: { type: string; timeout?: string }) => Promise<unknown>
}
