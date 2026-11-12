import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { createdAt, id, orgId, selector, updatedAt } from './columns'

const rule = () => ({
  id: id(),
  ...selector(),
  channel: text('channel').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  locked: integer('locked', { mode: 'boolean' }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const kitNotificationDeploymentRules = sqliteTable(
  'kit_notification_deployment_rules',
  rule(),
  (t) => [
    unique('kit_notification_deployment_rules_natural_unique').on(
      t.selectorKind,
      t.selectorValue,
      t.channel,
    ),
  ],
)
export const kitNotificationOrganizationRules = sqliteTable(
  'kit_notification_organization_rules',
  { ...rule(), orgId: orgId() },
  (t) => [
    unique('kit_notification_organization_rules_natural_unique').on(
      t.orgId,
      t.selectorKind,
      t.selectorValue,
      t.channel,
    ),
  ],
)
export const kitNotificationUserRules = sqliteTable(
  'kit_notification_user_rules',
  { ...rule(), userId: text('user_id').notNull() },
  (t) => [
    unique('kit_notification_user_rules_natural_unique').on(
      t.userId,
      t.selectorKind,
      t.selectorValue,
      t.channel,
    ),
  ],
)
export const kitNotificationDestinations = sqliteTable(
  'kit_notification_destinations',
  {
    id: id(),
    orgId: orgId(),
    channel: text('channel').notNull(),
    externalId: text('external_id').notNull(),
    ...selector(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('kit_notification_destinations_id_org_unique').on(t.id, t.orgId),
    unique('kit_notification_destinations_natural_unique').on(t.orgId, t.channel, t.externalId),
  ],
)
