import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { createDb } from '@kit/db'
import { flowApprovalEventType, registryHas } from '@kit/flows'
import { DriveNonRetryableError, driveFlowRun } from '@kit/flows/run'
import { schema } from '../db/schema'
import type { Env } from '../env'
import { dogfoodToolRegistry } from '../lib/flows-dogfood'
import { createNotificationDeliveryRuntime } from '../notifications-delivery/admission'
import { createAppNotificationService } from '../services/notifications/app'
import { createFlowApprovalNotificationPorts } from '../services/notifications/flow-producer'
import { inferMock, invokeEcho } from './ports'

type FlowRunParams = { runId: string; orgId: string }

/**
 * Thin WorkflowEntrypoint. run() delegates to driveFlowRun.
 *
 * Limits:
 * - 1 MiB step/event — snapshot stays in D1, not in params
 * - persist-in-step — D1 writes inside step.do
 * - invoke retries follow DriveStep config (sealed effect `read` → limit 3; write/absent → 0)
 * - infer retries 0; approve open/resolve 0, idempotent read/clock 3
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
      const db = createDb(this.env.DB, schema)
      return await driveFlowRun({
        step: driveStep,
        db: this.env.DB,
        // Binding resolution (Roxabi/roxabi-boilerplate-cf#232) runs inside driveFlowRun → runInvokeStep via resolveWholeBindings.
        invoke: invokeEcho,
        infer: inferMock,
        hasTool: (name) => registryHas(dogfoodToolRegistry, name),
        approvalNotifications: createFlowApprovalNotificationPorts(
          db,
          createAppNotificationService(db, createNotificationDeliveryRuntime(db, this.env)),
        ),
        isSensitive: (name) => dogfoodToolRegistry.tools.get(name)?.sensitiveOutput === true,
        awaitApproval: async (taskId, timeoutMs, attempt) => {
          try {
            const woke = await step.waitForEvent(`approval:${taskId}:${attempt}`, {
              type: await flowApprovalEventType(taskId),
              timeout: timeoutMs,
            })
            void woke
            return 'event'
          } catch {
            return 'timeout'
          }
        },
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
