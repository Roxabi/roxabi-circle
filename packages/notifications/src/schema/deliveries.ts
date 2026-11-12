import { sql } from 'drizzle-orm'
import {
  foreignKey,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { createdAt, id, orgId, receipt } from './columns'

export const kitNotifications = sqliteTable(
  'kit_notifications',
  {
    id: id(),
    orgId: orgId(),
    userId: text('user_id').notNull(),
    typeKey: text('type_key').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceId: text('source_id').notNull(),
    paramsJson: text('params_json').notNull(),
    moduleId: text('module_id'),
    createdAt: createdAt(),
    readAt: integer('read_at'),
    resolvedAt: integer('resolved_at'),
  },
  (t) => [
    unique('kit_notifications_id_org_unique').on(t.id, t.orgId),
    uniqueIndex('kit_notifications_active_unique')
      .on(t.orgId, t.typeKey, t.sourceKind, t.sourceId, t.userId)
      .where(sql`${t.resolvedAt} IS NULL`),
  ],
)

export const kitNotificationDeliveries = sqliteTable(
  'kit_notification_deliveries',
  {
    id: id(),
    orgId: orgId(),
    notificationId: text('notification_id').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull(),
    createdAt: createdAt(),
    ...receipt(),
  },
  (t) => [
    unique('kit_notification_deliveries_natural_unique').on(t.orgId, t.notificationId, t.channel),
    foreignKey({
      columns: [t.notificationId, t.orgId],
      foreignColumns: [kitNotifications.id, kitNotifications.orgId],
    }).onDelete('cascade'),
  ],
)

export const kitNotificationOrganizationDeliveries = sqliteTable(
  'kit_notification_organization_deliveries',
  {
    id: id(),
    orgId: orgId(),
    destinationId: text('destination_id').notNull(),
    channel: text('channel').notNull(),
    typeKey: text('type_key').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceId: text('source_id').notNull(),
    paramsJson: text('params_json').notNull(),
    moduleId: text('module_id'),
    status: text('status').notNull(),
    createdAt: createdAt(),
    resolvedAt: integer('resolved_at'),
    ...receipt(),
  },
  (t) => [
    uniqueIndex('kit_notification_org_deliveries_active_unique')
      .on(t.orgId, t.destinationId, t.channel, t.typeKey, t.sourceKind, t.sourceId)
      .where(sql`${t.resolvedAt} IS NULL`),
  ],
)
