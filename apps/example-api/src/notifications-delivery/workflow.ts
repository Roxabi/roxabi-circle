import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { createDb } from '@kit/db'
import { type DeliveryRef, deliveryRefSchema } from '@kit/notifications'
import {
  finishDelivery,
  loadDelivery,
  recordDeliveryAdmissionObservation,
} from '@kit/notifications/repos'
import { schema } from '../db/schema'
import type { Env } from '../env'
import { deliveryWorkflowId } from '../services/notifications/delivery-identity'
import { sendNotificationAttempt } from './attempt'
import { createDeliveryRetryableError, notificationDeliveryRetryDelay } from './retry'
import { handleRetryable } from './retry-attempt'
import { type DeliveryAttemptResult, type DeliveryOutcome, deliveryOutcomeSchema } from './types'

const ordinaryStep = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
  timeout: '1 minute',
} as const

export class NotificationDeliveryWorkflow extends WorkflowEntrypoint<Env, DeliveryRef> {
  async run(
    event: WorkflowEvent<DeliveryRef>,
    step: WorkflowStep,
  ): Promise<DeliveryOutcome | null> {
    const parsed = deliveryRefSchema.safeParse(event.payload)
    if (!parsed.success) throw new NonRetryableError('Invalid delivery reference')
    const ref = parsed.data
    const prefix = ref.kind === 'user' ? /^u_[A-Za-z0-9]/ : /^o_[A-Za-z0-9]/
    if (!prefix.test(ref.id)) throw new NonRetryableError('Invalid delivery reference')
    const workflowId = await deliveryWorkflowId(ref)
    if (event.instanceId !== workflowId)
      throw new NonRetryableError('Invalid delivery workflow identity')
    const db = createDb(this.env.DB, schema)

    const admission = await step.do('delivery:admit', ordinaryStep, async () => {
      const row = await loadDelivery(db, ref)
      if (!row) return { kind: 'missing' } as const
      if (row.workflowId !== workflowId)
        throw new NonRetryableError('Delivery workflow identity mismatch')
      if (row.status !== 'pending') {
        return {
          kind: 'terminal',
          outcome: deliveryOutcomeSchema.parse({ status: row.status, code: row.errorCode }),
        } as const
      }
      if (ref.kind !== 'user' || row.channel !== 'email') return { kind: 'unsupported' } as const
      const observed = await recordDeliveryAdmissionObservation(db, {
        ref,
        workflowId,
        observedAt: Date.now(),
        observation: { kind: 'admitted', proof: 'instance_present' },
      })
      if (observed.kind === 'not_found') return { kind: 'missing' } as const
      if (observed.kind === 'identity_mismatch')
        throw new NonRetryableError('Delivery workflow identity mismatch')
      return { kind: 'ready' } as const
    })
    if (admission.kind === 'missing' || admission.kind === 'unsupported') return null
    if (admission.kind === 'terminal') return admission.outcome

    let outcome: DeliveryOutcome
    try {
      outcome = await step.do(
        'delivery:send',
        {
          retries: { limit: 5, delay: notificationDeliveryRetryDelay, backoff: 'constant' },
          timeout: '1 minute',
        },
        async () => {
          let result: DeliveryAttemptResult
          try {
            result = await sendNotificationAttempt(db, this.env, ref, workflowId)
          } catch {
            throw createDeliveryRetryableError({ code: 'delivery_attempt_interrupted' })
          }
          if (result.status !== 'retryable') {
            const terminal = deliveryOutcomeSchema.safeParse(result)
            if (!terminal.success)
              throw createDeliveryRetryableError({ code: 'delivery_attempt_interrupted' })
            return terminal.data
          }
          return handleRetryable(db, ref, result)
        },
      )
    } catch {
      outcome = { status: 'failed', code: 'delivery_retries_exhausted' }
    }

    return step.do('delivery:finish', ordinaryStep, async () => {
      await finishDelivery(
        db,
        ref,
        { status: outcome.status, ...(outcome.code === null ? {} : { code: outcome.code }) },
        Date.now(),
      )
      const row = await loadDelivery(db, ref)
      if (!row) return null
      if (row.workflowId !== workflowId || row.status === 'pending')
        throw new Error('Delivery finish receipt unavailable')
      const receipt = deliveryOutcomeSchema.parse({ status: row.status, code: row.errorCode })
      console.info('notification_delivery_finished', {
        orgId: ref.orgId,
        type: row.type,
        channel: row.channel,
        code: receipt.code,
        status: receipt.status,
      })
      return receipt
    })
  }
}
