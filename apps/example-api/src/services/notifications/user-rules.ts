import { z } from '@hono/zod-openapi'
import { AppError, decodeListCursor, takeListPage } from '@kit/core'
import { resolveUserNotification, type UserRule } from '@kit/notifications'
import type { InboxScope } from '@kit/notifications/repos'
import type { ListQuery } from '@kit/types'
import type { KitDb } from '../../lib/db-type'
import { notificationsDogfoodRegistry } from '../../lib/notifications-dogfood'
import {
  channelKeySchema,
  epochMsSchema,
  rowIdSchema,
  typeKeySchema,
} from '../../routes/notifications/shared.schemas'
import { allRules } from './rules-pager'

const typeCursor = z.strictObject({ type: typeKeySchema })
const effectiveCursor = z.strictObject({ type: typeKeySchema, channel: channelKeySchema })
const ruleCursor = z.strictObject({ createdAt: epochMsSchema, id: rowIdSchema })

// Check raw own keys before Zod: __proto__ must not disappear during object parsing.
function cursorValue<T>(
  cursor: string | undefined,
  schema: z.ZodType<T>,
  keys: readonly string[],
): T | undefined {
  if (cursor === undefined) return undefined
  const raw = decodeListCursor(cursor)
  const actual = Object.keys(raw)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw AppError.validation('Invalid cursor')
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw AppError.validation('Invalid cursor')
  return result.data
}

export function validateRuleCursor(cursor?: string) {
  cursorValue(cursor, ruleCursor, ['createdAt', 'id'])
}

const entries = () =>
  Object.entries(notificationsDogfoodRegistry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

export function listNotificationTypes(query: ListQuery) {
  const cursor = cursorValue(query.cursor, typeCursor, ['type'])
  const rows = entries()
    .filter(([type]) => !cursor || type > cursor.type)
    .map(([type, definition]) => ({
      type,
      category: definition.category,
      moduleId: definition.moduleId ?? null,
      channels: [...definition.channels],
      defaultOn: [...definition.defaultOn],
      organizationDestinations: definition.organizationDestinations === true,
    }))
  return takeListPage(rows, query.limit ?? 50, (row) => ({ type: row.type }))
}

export async function listEffectiveRules(db: KitDb, scope: InboxScope, query: ListQuery) {
  const cursor = cursorValue(query.cursor, effectiveCursor, ['type', 'channel'])
  const [deploymentRules, organizationRules, storedUserRules] = await Promise.all([
    allRules(db, { level: 'deployment' }),
    allRules(db, { level: 'organization', orgId: scope.orgId }),
    allRules(db, { level: 'user', userId: scope.userId }),
  ])
  if (storedUserRules.some((rule) => rule.locked)) throw AppError.internal('Invalid user rule')
  const userRules = storedUserRules as UserRule[]
  const readable = new Set(scope.readableModuleIds)
  const rows = entries()
    .flatMap(([type, definition]) => {
      // Display only: actual membership has already been checked; access is not an admission decision.
      const resolved = resolveUserNotification({
        typeKey: type,
        type: definition,
        access: { organizationActive: true, member: true, moduleReadable: true },
        deploymentRules,
        organizationRules,
        userRules,
      })
      if (!resolved.admitted) throw AppError.internal('Cannot resolve notification preview')
      const available = !definition.moduleId || readable.has(definition.moduleId)
      return resolved.external.map((decision) => ({ type, ...decision, available }))
    })
    .sort((a, b) =>
      a.type < b.type
        ? -1
        : a.type > b.type
          ? 1
          : a.channel < b.channel
            ? -1
            : a.channel > b.channel
              ? 1
              : 0,
    )
    .filter(
      (row) =>
        !cursor ||
        row.type > cursor.type ||
        (row.type === cursor.type && row.channel > cursor.channel),
    )
  return takeListPage(rows, query.limit ?? 50, ({ type, channel }) => ({ type, channel }))
}
