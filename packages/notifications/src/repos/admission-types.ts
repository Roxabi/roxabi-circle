import type { DeliveryRef } from '../delivery-ref'
import type { DeliveryRow } from './types'

export type DeliveryAdmissionReceipt = Readonly<
  Pick<
    DeliveryRow,
    | 'ref'
    | 'workflowId'
    | 'admissionStatus'
    | 'admissionDeadlineAt'
    | 'admittedAt'
    | 'lastAdmissionCheckAt'
    | 'status'
    | 'createdAt'
    | 'finishedAt'
  >
>
export type DeliveryAdmissionCandidate = DeliveryAdmissionReceipt &
  Readonly<{ status: 'pending'; action: 'observe' | 'expire' }>
export type DeliveryAdmissionCandidatesQuery = Readonly<{
  now: number
  limit: number
  cursor?: string
}>
export type DeliveryAdmissionObservation =
  | Readonly<{ kind: 'admitted'; proof: 'created' | 'instance_present' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'expired' }>
export type RecordDeliveryAdmissionObservationInput = Readonly<{
  ref: DeliveryRef
  workflowId: string
  observedAt: number
  observation: DeliveryAdmissionObservation
}>
export type DeliveryAdmissionWriteResult =
  | Readonly<{ kind: 'updated' | 'unchanged'; receipt: DeliveryAdmissionReceipt }>
  | Readonly<{ kind: 'not_found' | 'identity_mismatch' }>
