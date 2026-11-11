import { type DeliveryRef, deliveryRefSchema } from '@kit/notifications'
import {
  listDeliveryAdmissionCandidates,
  loadDelivery,
  recordDeliveryAdmissionObservation,
} from '@kit/notifications/repos'
import type { Env } from '../env'
import type { KitDb } from '../lib/db-type'
import { deliveryWorkflowId } from '../services/notifications/delivery-identity'
import type { NotificationRuntimePorts } from '../services/notifications/service'
import { createAdmissionHelpers } from './admission-helpers'

const present: Record<string, true> = {
  queued: true,
  running: true,
  waiting: true,
  paused: true,
  waitingForPause: true,
  rollingBack: true,
  complete: true,
  errored: true,
  terminated: true,
}

type Observation = { status: string; output?: unknown }

function incident(ref: DeliveryRef, code: string): void {
  console.error(
    JSON.stringify({ level: 'error', msg: code, orgId: ref.orgId, kind: ref.kind, id: ref.id }),
  )
}

export function createNotificationDeliveryRuntime(
  db: KitDb,
  env: Pick<Env, 'NOTIFICATION_DELIVERY'>,
  now: () => number = Date.now,
): NotificationRuntimePorts & {
  reconcileDeliveryAdmissions(input: { orgId: string; now: number; limit: number }): Promise<void>
} {
  async function observe(workflowId: string): Promise<Observation | null> {
    try {
      const instance = await env.NOTIFICATION_DELIVERY.get(workflowId)
      const status = await instance.status()
      return Object.hasOwn(present, status.status) ? status : null
    } catch {
      return null
    }
  }

  async function mark(
    ref: DeliveryRef,
    workflowId: string,
    kind: 'unknown' | 'expired' | 'admitted',
    proof: 'created' | 'instance_present' = 'instance_present',
  ) {
    return recordDeliveryAdmissionObservation(db, {
      ref,
      workflowId,
      observedAt: now(),
      observation: kind === 'admitted' ? { kind, proof } : { kind },
    })
  }

  const { project, createIfEligible } = createAdmissionHelpers(
    db,
    env,
    now,
    mark,
    observe,
    incident,
  )

  async function loadSupportedPendingDelivery(ref: DeliveryRef) {
    const row = await loadDelivery(db, ref)
    if (row?.status !== 'pending') return null
    const workflowId = await deliveryWorkflowId(ref)
    if (row.workflowId !== workflowId) {
      incident(ref, 'delivery_identity_mismatch')
      return null
    }
    if (row.admissionStatus === 'expired') return null
    if (ref.kind !== 'user' || row.channel !== 'email') {
      await mark(ref, workflowId, now() >= row.admissionDeadlineAt ? 'expired' : 'unknown')
      incident(ref, 'delivery_channel_not_enabled')
      return null
    }
    return row
  }

  async function ensureDeliveryAdmission(input: DeliveryRef): Promise<void> {
    const ref = deliveryRefSchema.parse(input)
    const row = await loadSupportedPendingDelivery(ref)
    if (!row) return
    const workflowId = row.workflowId
    if (now() >= row.admissionDeadlineAt) {
      if (row.admissionStatus !== 'admitted') await mark(ref, workflowId, 'expired')
      return
    }
    const status = await observe(workflowId)
    if (status) {
      await project(ref, workflowId, status)
      return
    }
    await createIfEligible(ref, workflowId)
  }

  return {
    ensureDeliveryAdmission,
    reportFailure({ ref, code }) {
      incident(ref, code)
    },
    async reconcileDeliveryAdmissions(input) {
      const page = await listDeliveryAdmissionCandidates(
        db,
        { orgId: input.orgId },
        { now: input.now, limit: input.limit },
      )
      for (const candidate of page.items) {
        try {
          await ensureDeliveryAdmission(candidate.ref)
        } catch {
          incident(candidate.ref, 'delivery_admission_interrupted')
        }
      }
    },
  }
}
