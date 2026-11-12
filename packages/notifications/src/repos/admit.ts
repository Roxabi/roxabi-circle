import { AppError } from '@kit/core'
import { z } from 'zod'
import { deliveryRefSchema } from '../delivery-ref'
import { lifecycleBatch, lifecycleStatement } from './admit-sql'
import type { AdmissionBatch, AdmissionOwnerIdentity, Db, NotifyResult } from './types'
import {
  channelKeySchema,
  epochMsSchema,
  identitySchema,
  parseRepositoryInput,
  rowIdSchema,
  serializeParams,
  sourceRefSchema,
  typeKeySchema,
  workflowIdSchema,
} from './validation'

const batchSchema = z.strictObject({
  orgId: identitySchema,
  type: typeKeySchema,
  moduleId: identitySchema.nullable(),
  source: sourceRefSchema,
  params: z.json(),
  now: epochMsSchema,
  users: z.array(
    z.strictObject({
      id: rowIdSchema,
      userId: identitySchema,
      deliveries: z.array(z.strictObject({ id: rowIdSchema, channel: channelKeySchema })),
    }),
  ),
  organizations: z.array(
    z.strictObject({ id: rowIdSchema, destinationId: rowIdSchema, channel: channelKeySchema }),
  ),
})
const identitiesSchema = z.array(
  z.strictObject({
    ref: deliveryRefSchema,
    workflowId: workflowIdSchema,
    admissionDeadlineAt: epochMsSchema,
  }),
)

function validateOwners(
  data: z.infer<typeof batchSchema>,
  identities: z.infer<typeof identitiesSchema>,
) {
  const deadline = data.now + 86_400_000
  if (!Number.isSafeInteger(deadline)) throw AppError.validation('Invalid notifications input')
  const owners = new Map<string, (typeof identities)[number]>()
  for (const identity of identities) {
    const { ref } = identity
    const key = `${ref.kind}:${ref.id}`
    if (
      ref.orgId !== data.orgId ||
      !(ref.kind === 'user' ? /^u_[A-Za-z0-9]/ : /^o_[A-Za-z0-9]/).test(ref.id) ||
      identity.admissionDeadlineAt !== deadline ||
      owners.has(key)
    )
      throw AppError.validation('Invalid notifications input')
    owners.set(key, identity)
  }
  const planned = new Set<string>()
  const owner = (kind: 'user' | 'organization', id: string) => {
    const key = `${kind}:${id}`
    const value = owners.get(key)
    if (!value || planned.has(key)) throw AppError.validation('Invalid notifications input')
    planned.add(key)
    return value
  }
  for (const user of data.users) for (const delivery of user.deliveries) owner('user', delivery.id)
  for (const delivery of data.organizations) owner('organization', delivery.id)
  if (planned.size !== owners.size) throw AppError.validation('Invalid notifications input')
  return { owners, deadline }
}

export async function admitNotifications(
  db: Db,
  input: AdmissionBatch,
  ownerIdentities: readonly AdmissionOwnerIdentity[],
): Promise<NotifyResult> {
  const data = parseRepositoryInput(batchSchema, input)
  const identities = parseRepositoryInput(identitiesSchema, ownerIdentities)
  const { owners, deadline } = validateOwners(data, identities)
  const params = serializeParams(data.params)
  const statements = []
  const kinds: Array<'notification' | 'user' | 'organization'> = []
  for (const user of data.users) {
    statements.push(
      lifecycleStatement(
        db,
        `INSERT INTO kit_notifications (id,org_id,user_id,type_key,module_id,source_kind,source_id,params_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (org_id,type_key,source_kind,source_id,user_id) WHERE resolved_at IS NULL DO NOTHING RETURNING id`,
        [
          user.id,
          data.orgId,
          user.userId,
          data.type,
          data.moduleId,
          data.source.kind,
          data.source.id,
          params,
          data.now,
        ],
      ),
    )
    kinds.push('notification')
    // Each child statement sees the previous insert's changes(); no intervening write is allowed.
    for (let i = 0; i < user.deliveries.length; i += 10) {
      const chunk = user.deliveries.slice(i, i + 10)
      const values: unknown[] = []
      const rows = chunk.map((delivery) => {
        const identity = owners.get(`user:${delivery.id}`)!
        values.push(
          delivery.id,
          data.orgId,
          user.id,
          delivery.channel,
          data.now,
          identity.workflowId,
          deadline,
        )
        return "(?,?,?,?,'pending',?, ?,'pending',?)"
      })
      statements.push(
        lifecycleStatement(
          db,
          `INSERT INTO kit_notification_deliveries
        (id,org_id,notification_id,channel,status,created_at,workflow_id,admission_status,admission_deadline_at)
        SELECT column1,column2,column3,column4,column5,column6,column7,column8,column9 FROM (VALUES ${rows.join(',')}) WHERE changes()>0 RETURNING id`,
          values,
        ),
      )
      kinds.push('user')
    }
  }
  for (const delivery of data.organizations) {
    const identity = owners.get(`organization:${delivery.id}`)!
    statements.push(
      lifecycleStatement(
        db,
        `INSERT INTO kit_notification_organization_deliveries
      (id,org_id,destination_id,channel,type_key,source_kind,source_id,params_json,module_id,status,created_at,workflow_id,admission_status,admission_deadline_at)
      VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,'pending',?)
      ON CONFLICT (org_id,destination_id,channel,type_key,source_kind,source_id) WHERE resolved_at IS NULL DO NOTHING RETURNING id`,
        [
          delivery.id,
          data.orgId,
          delivery.destinationId,
          delivery.channel,
          data.type,
          data.source.kind,
          data.source.id,
          params,
          data.moduleId,
          data.now,
          identity.workflowId,
          deadline,
        ],
      ),
    )
    kinds.push('organization')
  }
  const results = await lifecycleBatch(db, statements)
  const createdNotificationIds: string[] = []
  const createdDeliveries: NotifyResult['createdDeliveries'][number][] = []
  results.forEach((result, index) => {
    for (const row of result.results) {
      const id = String(row.id)
      const kind = kinds[index]
      if (kind === 'notification') createdNotificationIds.push(id)
      else if (kind) createdDeliveries.push({ orgId: data.orgId, kind, id })
    }
  })
  return { createdNotificationIds, createdDeliveries }
}
