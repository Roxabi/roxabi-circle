import { assertSafeTokenHref } from '@kit/email'
import {
  type DeliveryRef,
  parseNotificationParams,
  type RegistryEntry,
  renderNotificationEmail,
  resolveUserNotification,
} from '@kit/notifications'
import { type DeliveryRow, loadDelivery, recordAttempt } from '@kit/notifications/repos'
import type { Env } from '../env'
import type { KitDb } from '../lib/db-type'
import { resolveEmailPort } from '../lib/email-port'
import { notificationsDogfoodRegistry as registry } from '../lib/notifications-dogfood'
import { corsAllowlist } from '../lib/session-env'
import { notificationMessages } from '../messages'
import { findBaUserById } from '../repos/users'
import { createAppNotificationPersistencePorts } from '../services/notifications/app'
import { notificationSourcePath } from '../services/notifications/inbox'
import { createNotificationEmailChannel } from './email-channel'
import { type DeliveryAttemptResult, deliveryOutcomeSchema } from './types'

const missing: DeliveryAttemptResult = { status: 'skipped', code: 'delivery_missing' }

function terminal(row: DeliveryRow): DeliveryAttemptResult | null {
  if (row.status === 'pending') return null
  return deliveryOutcomeSchema.parse({ status: row.status, code: row.errorCode })
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

function links(env: Env, row: DeliveryRow) {
  const origins = corsAllowlist(env)
  const base = origins[0]
  if (!base) throw new Error('Missing web origin')
  const href = assertSafeTokenHref(new URL(notificationSourcePath(row), base).toString(), {
    allowedOrigins: origins,
  })
  const configured = env.BETTER_AUTH_URL
  if (!configured || hasControlCharacters(configured)) throw new Error('Invalid auth URL')
  const auth = new URL(configured)
  if ((auth.protocol !== 'https:' && auth.protocol !== 'http:') || auth.username || auth.password)
    throw new Error('Invalid auth URL')
  const manageRulesHref = assertSafeTokenHref(
    new URL('/api/me/notification-rules', auth.origin).toString(),
    {
      allowedOrigins: [auth.origin],
    },
  )
  return { href, manageRulesHref }
}

function definitionFor(row: DeliveryRow) {
  const definition =
    row.type === 'tasks.assigned'
      ? registry['tasks.assigned']
      : row.type === 'flows.approval_requested'
        ? registry['flows.approval_requested']
        : null
  if (!definition || (definition.moduleId ?? null) !== row.moduleId)
    throw new Error('Invalid notification definition')
  if (row.type === 'tasks.assigned') parseNotificationParams(registry['tasks.assigned'], row.params)
  else parseNotificationParams(registry['flows.approval_requested'], row.params)
  return definition
}

async function emailAllowed(
  db: KitDb,
  row: DeliveryRow,
  userId: string,
  definition: RegistryEntry,
) {
  const ports = createAppNotificationPersistencePorts(db)
  const access = await ports.recipientAccess({
    orgId: row.ref.orgId,
    userIds: [userId],
    moduleId: definition.moduleId,
  })
  const facts = access.get(userId)
  if (!facts) throw new Error('Missing access facts')
  const rules = await ports.rules({ orgId: row.ref.orgId, userIds: [userId] })
  const decision = resolveUserNotification({
    typeKey: row.type,
    type: definition,
    access: facts,
    deploymentRules: rules.deployment,
    organizationRules: rules.organization,
    userRules: rules.users.get(userId) ?? [],
  })
  return (
    decision.admitted && decision.external.some((item) => item.channel === 'email' && item.enabled)
  )
}

async function currentReceipt(
  db: KitDb,
  ref: DeliveryRef,
  expectedWorkflowId: string,
): Promise<DeliveryAttemptResult> {
  const current = await loadDelivery(db, ref)
  if (!current) return missing
  if (current.workflowId !== expectedWorkflowId) throw new Error('Delivery identity mismatch')
  const actual = terminal(current)
  if (actual) return actual
  throw new Error('Attempt compare-and-set failed')
}

export async function sendNotificationAttempt(
  db: KitDb,
  env: Env,
  ref: DeliveryRef,
  expectedWorkflowId: string,
  now: () => number = Date.now,
): Promise<DeliveryAttemptResult> {
  const row = await loadDelivery(db, ref)
  if (!row) return missing
  if (row.workflowId !== expectedWorkflowId) throw new Error('Delivery identity mismatch')
  const existing = terminal(row)
  if (existing) return existing
  if (ref.kind !== 'user' || row.channel !== 'email' || !row.userId)
    throw new Error('Delivery channel not enabled')
  const definition = definitionFor(row)
  if (row.resolvedAt !== null) return { status: 'skipped', code: 'notification_resolved' }
  if (!(await emailAllowed(db, row, row.userId, definition)))
    return { status: 'skipped', code: 'notification_access_denied' }
  const user = await findBaUserById(db, row.userId)
  if (!(user?.email && user.emailVerified))
    return { status: 'skipped', code: 'email_address_unavailable' }
  const locale = notificationMessages.defaultLocale
  const copy = notificationMessages.t(locale)
  const { href, manageRulesHref } = links(env, row)
  const input = { orgId: ref.orgId, source: row.source, locale, href }
  const content =
    row.type === 'tasks.assigned'
      ? registry['tasks.assigned'].render.email!({
          ...input,
          params: parseNotificationParams(registry['tasks.assigned'], row.params),
        })
      : registry['flows.approval_requested'].render.email!({
          ...input,
          params: parseNotificationParams(registry['flows.approval_requested'], row.params),
        })
  const rendered = renderNotificationEmail({
    content,
    manageRulesHref,
    copy: { brand: copy.emailBrand, manageRulesLabel: copy.manageNotificationRules },
  })
  const port = resolveEmailPort(env)
  if (!(await recordAttempt(db, ref, now()))) return currentReceipt(db, ref, expectedWorkflowId)
  const result = await createNotificationEmailChannel(port, env.EMAIL_TRANSPORT).send({
    orgId: ref.orgId,
    to: user.email,
    content: rendered,
  })
  if (result.status === 'sent') return { status: 'sent', code: null }
  if (result.status === 'permanent') return { status: 'failed', code: result.code }
  return result
}
