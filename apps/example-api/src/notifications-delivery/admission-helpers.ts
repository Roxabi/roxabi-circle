import type { DeliveryRef } from '@kit/notifications'
import {
  type DeliveryAdmissionWriteResult,
  finishDelivery,
  loadDelivery,
} from '@kit/notifications/repos'
import type { Env } from '../env'
import type { KitDb } from '../lib/db-type'
import { deliveryOutcomeSchema } from './types'

type Observation = { status: string; output?: unknown }
type Mark = (
  ref: DeliveryRef,
  workflowId: string,
  kind: 'unknown' | 'expired' | 'admitted',
  proof?: 'created' | 'instance_present',
) => Promise<DeliveryAdmissionWriteResult>

type Outcome = { status: 'sent' | 'failed' | 'skipped'; code: string | null }

export function createAdmissionHelpers(
  db: KitDb,
  env: Pick<Env, 'NOTIFICATION_DELIVERY'>,
  now: () => number,
  mark: Mark,
  observe: (workflowId: string) => Promise<Observation | null>,
  incident: (ref: DeliveryRef, code: string) => void,
) {
  async function finishProjection(
    ref: DeliveryRef,
    workflowId: string,
    outcome: Outcome,
  ): Promise<void> {
    const current = await loadDelivery(db, ref)
    if (current?.status !== 'pending' || current.workflowId !== workflowId) return
    await finishDelivery(
      db,
      ref,
      { status: outcome.status, ...(outcome.code === null ? {} : { code: outcome.code }) },
      now(),
    )
    const receipt = await loadDelivery(db, ref)
    if (!receipt) return
    if (receipt.workflowId !== workflowId || receipt.status === 'pending') {
      incident(ref, 'delivery_projection_receipt_unavailable')
      return
    }
    const actual = deliveryOutcomeSchema.safeParse({
      status: receipt.status,
      code: receipt.errorCode,
    })
    if (!actual.success) {
      incident(ref, 'delivery_projection_receipt_invalid')
      return
    }
    console.info(
      JSON.stringify({
        level: 'info',
        msg: 'notification_delivery_finished',
        orgId: ref.orgId,
        type: receipt.type,
        channel: receipt.channel,
        ...actual.data,
      }),
    )
  }

  async function project(ref: DeliveryRef, workflowId: string, status: Observation): Promise<void> {
    const marked = await mark(ref, workflowId, 'admitted')
    if (!('receipt' in marked) || marked.receipt.status !== 'pending') return
    let outcome: Outcome | undefined
    if (status.status === 'complete') {
      const parsed = deliveryOutcomeSchema.safeParse(status.output)
      if (!parsed.success) {
        incident(ref, 'delivery_workflow_output_invalid')
        return
      }
      outcome = parsed.data
    } else if (status.status === 'errored' || status.status === 'terminated') {
      outcome = { status: 'failed', code: `delivery_workflow_${status.status}` }
    }
    if (outcome) await finishProjection(ref, workflowId, outcome)
  }

  async function recoverCreation(
    ref: DeliveryRef,
    workflowId: string,
    deadline: number,
  ): Promise<void> {
    if (now() >= deadline) {
      await mark(ref, workflowId, 'expired')
      return
    }
    const after = await observe(workflowId)
    if (after) await project(ref, workflowId, after)
    else await mark(ref, workflowId, now() >= deadline ? 'expired' : 'unknown')
  }

  async function createIfEligible(ref: DeliveryRef, workflowId: string): Promise<void> {
    const current = await loadDelivery(db, ref)
    if (
      current?.status !== 'pending' ||
      current.workflowId !== workflowId ||
      current.admissionStatus === 'expired'
    )
      return
    const currentTime = now()
    if (currentTime >= current.admissionDeadlineAt) {
      if (current.admissionStatus !== 'admitted') await mark(ref, workflowId, 'expired')
      return
    }
    if (current.admissionStatus === 'admitted') {
      await mark(ref, workflowId, 'unknown')
      return
    }
    try {
      await env.NOTIFICATION_DELIVERY.create({ id: workflowId, params: ref })
    } catch {
      await recoverCreation(ref, workflowId, current.admissionDeadlineAt)
      return
    }
    await mark(ref, workflowId, 'admitted', 'created')
  }

  return { project, createIfEligible }
}
