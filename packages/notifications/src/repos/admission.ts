import type { ListPage } from '@kit/types'
import { and, eq, sql } from 'drizzle-orm'
import { kitNotificationDeliveries, kitNotificationOrganizationDeliveries } from '../drizzle-schema'
import { encodeAdmissionCursor, parseAdmissionCursor } from './admission-cursor'
import type {
  DeliveryAdmissionCandidate,
  DeliveryAdmissionCandidatesQuery,
  DeliveryAdmissionReceipt,
  DeliveryAdmissionWriteResult,
  RecordDeliveryAdmissionObservationInput,
} from './admission-types'
import { candidatesQuerySchema, observationInputSchema, scopeSchema } from './admission-validation'
import type { Db } from './types'
import { parseRepositoryInput } from './validation'

type ReceiptRow = {
  id: string
  workflowId: string
  admissionStatus: DeliveryAdmissionReceipt['admissionStatus']
  admissionDeadlineAt: number
  admittedAt: number | null
  lastAdmissionCheckAt: number | null
  status: DeliveryAdmissionReceipt['status']
  createdAt: number
  finishedAt: number | null
}
type CandidateRow = ReceiptRow & {
  kind: 'user' | 'organization'
  action: 'observe' | 'expire'
  sortCheck: number
}

function receipt(
  row: ReceiptRow,
  orgId: string,
  kind: 'user' | 'organization',
): DeliveryAdmissionReceipt {
  return {
    ref: { orgId, kind, id: row.id },
    workflowId: row.workflowId,
    admissionStatus: row.admissionStatus,
    admissionDeadlineAt: row.admissionDeadlineAt,
    admittedAt: row.admittedAt,
    lastAdmissionCheckAt: row.lastAdmissionCheckAt,
    status: row.status,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  }
}

export async function recordDeliveryAdmissionObservation(
  db: Db,
  input: RecordDeliveryAdmissionObservationInput,
): Promise<DeliveryAdmissionWriteResult> {
  const { ref, workflowId, observedAt, observation } = parseRepositoryInput(
    observationInputSchema,
    input,
  )
  const t = ref.kind === 'user' ? kitNotificationDeliveries : kitNotificationOrganizationDeliveries
  const applicable =
    observation.kind === 'expired' ? sql`${t.admissionDeadlineAt} <= ${observedAt}` : sql`1`
  const nextStatus =
    observation.kind === 'admitted'
      ? sql`'admitted'`
      : sql`case when ${t.admissionStatus} in ('pending', 'unknown') then case when ${t.admissionDeadlineAt} <= ${observedAt} then 'expired' else 'unknown' end else ${t.admissionStatus} end`
  const nextAdmitted =
    observation.kind === 'admitted'
      ? sql`coalesce(${t.admittedAt}, ${observedAt})`
      : sql`${t.admittedAt}`
  const nextCheck = sql`case when ${t.lastAdmissionCheckAt} is null or ${t.lastAdmissionCheckAt} < ${observedAt} then ${observedAt} else ${t.lastAdmissionCheckAt} end`
  const fields = {
    id: t.id,
    workflowId: t.workflowId,
    admissionStatus: t.admissionStatus,
    admissionDeadlineAt: t.admissionDeadlineAt,
    admittedAt: t.admittedAt,
    lastAdmissionCheckAt: t.lastAdmissionCheckAt,
    status: t.status,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt,
  }
  const [changed, found] = await db.batch([
    db
      .update(t)
      .set({
        admissionStatus: nextStatus,
        admittedAt: nextAdmitted,
        lastAdmissionCheckAt: nextCheck,
      })
      .where(
        and(
          eq(t.orgId, ref.orgId),
          eq(t.id, ref.id),
          eq(t.workflowId, workflowId),
          applicable,
          sql`(${t.admissionStatus} is not (${nextStatus}) or ${t.admittedAt} is not (${nextAdmitted}) or ${t.lastAdmissionCheckAt} is not (${nextCheck}))`,
        ),
      )
      .returning(fields),
    db
      .select(fields)
      .from(t)
      .where(and(eq(t.orgId, ref.orgId), eq(t.id, ref.id)))
      .limit(1),
  ])
  const row = (changed[0] ?? found[0]) as ReceiptRow | undefined
  if (!row) return { kind: 'not_found' }
  if (row.workflowId !== workflowId) return { kind: 'identity_mismatch' }
  return {
    kind: changed.length ? 'updated' : 'unchanged',
    receipt: receipt(row, ref.orgId, ref.kind),
  }
}

export async function listDeliveryAdmissionCandidates(
  db: Db,
  scope: Readonly<{ orgId: string }>,
  query: DeliveryAdmissionCandidatesQuery,
): Promise<ListPage<DeliveryAdmissionCandidate>> {
  const { orgId } = parseRepositoryInput(scopeSchema, scope)
  const { now, limit, cursor } = parseRepositoryInput(candidatesQuerySchema, query)
  const key = cursor ? parseAdmissionCursor(cursor, now) : undefined
  const seek = key
    ? sql`and (sort_check > ${key.lastCheckAt} or (sort_check = ${key.lastCheckAt} and (created_at > ${key.createdAt} or (created_at = ${key.createdAt} and id collate binary > ${key.id}))))`
    : sql``
  const rows = await db.all<CandidateRow>(sql`
    select id, workflow_id as workflowId, admission_status as admissionStatus,
      admission_deadline_at as admissionDeadlineAt, admitted_at as admittedAt,
      last_admission_check_at as lastAdmissionCheckAt, status, created_at as createdAt,
      finished_at as finishedAt, kind, sort_check as sortCheck,
      case when admission_deadline_at <= ${now} then 'expire' else 'observe' end as action
    from (
      select id, workflow_id, admission_status, admission_deadline_at, admitted_at,
        last_admission_check_at, status, created_at, finished_at, 'user' as kind,
        coalesce(last_admission_check_at, -1) as sort_check
      from kit_notification_deliveries where org_id = ${orgId} and status = 'pending'
      union all
      select id, workflow_id, admission_status, admission_deadline_at, admitted_at,
        last_admission_check_at, status, created_at, finished_at, 'organization' as kind,
        coalesce(last_admission_check_at, -1) as sort_check
      from kit_notification_organization_deliveries where org_id = ${orgId} and status = 'pending'
    ) where (last_admission_check_at is null or last_admission_check_at < ${now})
      and ((created_at <= ${now - 120_000} and admission_deadline_at > ${now} and admission_status in ('pending', 'unknown', 'admitted'))
        or (admission_deadline_at <= ${now} and admission_status in ('pending', 'unknown')))
      ${seek}
    order by sort_check asc, created_at asc, id collate binary asc limit ${limit + 1}`)
  const selected = rows.slice(0, limit)
  const last = selected[selected.length - 1]
  return {
    items: selected.map((row) => ({
      ...receipt(row, orgId, row.kind),
      status: 'pending',
      action: row.action,
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeAdmissionCursor({
            asOf: now,
            lastCheckAt: last.sortCheck,
            createdAt: last.createdAt,
            kind: last.kind,
            id: last.id,
          })
        : null,
  }
}
