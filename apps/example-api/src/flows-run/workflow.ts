import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { registryHas } from '@kit/flows'
import type { Env } from '../env'
import { dogfoodToolRegistry } from '../lib/flows-dogfood'
import { DriveNonRetryableError, driveFlowRun } from './drive'
import { invokeEcho } from './ports'

type FlowRunParams = { runId: string; orgId: string }

/**
 * Thin WorkflowEntrypoint. run() delegates to driveFlowRun.
 *
 * Limits:
 * - 1 MiB step/event — snapshot stays in D1, not in params
 * - persist-in-step — D1 writes inside step.do
 * - invoke/infer retries 0 — do not re-invoke
 * - Workers Free = 10 ms CPU / step — insufficient
 * - WfP dispatch namespace unsupported
 * - showcase / production demo must be Workers Paid
 */
export class FlowRunWorkflow extends WorkflowEntrypoint<Env, FlowRunParams> {
  async run(event: WorkflowEvent<FlowRunParams>, step: WorkflowStep) {
    const driveStep = async <T>(
      name: string,
      fn: () => Promise<T>,
      config?: { retries?: { limit: number } },
    ): Promise<T> => {
      const callback = async () => {
        try {
          return await fn()
        } catch (err) {
          if (err instanceof DriveNonRetryableError) {
            throw new NonRetryableError(err.message)
          }
          throw err
        }
      }
      if (config) {
        return step.do(
          name,
          { retries: config.retries ? { limit: config.retries.limit, delay: 0 } : undefined },
          callback as never,
        ) as Promise<T>
      }
      return step.do(name, callback as never) as Promise<T>
    }
    try {
      return await driveFlowRun({
        step: driveStep,
        db: this.env.DB,
        invoke: invokeEcho,
        hasTool: (name) => registryHas(dogfoodToolRegistry, name),
        payload: event.payload,
        instanceId: event.instanceId,
      })
    } catch (err) {
      if (err instanceof DriveNonRetryableError) {
        throw new NonRetryableError(err.message)
      }
      throw err
    }
  }
}
